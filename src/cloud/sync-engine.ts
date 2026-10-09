import type { Table } from 'dexie';
import { SYNCED_TABLE_NAMES, type PosDatabase, type SyncedTableName } from '../db/db';
import type { StoredImage, SyncedRow } from '../db/schema';
import { nowIso } from '../domain/time';
import { CloudError, type CloudApi, type ServerCursor } from './api';
import {
  LOCAL_TABLE,
  SERVER_TABLE,
  fromServerRow,
  tableKind,
  toServerRow,
  type ServerRow,
} from './mapping';
import { mergeRemote } from './merge';

/** Per server table: the last row this device has pulled. */
export const META_SYNC_CURSORS = 'syncCursors';
export const META_LAST_SYNC = 'lastSyncAt';

export interface SyncOptions {
  /** Rows sent per request. */
  batchSize: number;
  /** Rows received per table per request. */
  pageSize: number;
  /**
   * Each pull starts this far before the last row seen. A row written in a
   * longer-running server transaction can become visible after newer rows;
   * looking back a little catches it. Re-reading rows is harmless.
   */
  overlapMs: number;
}

const DEFAULT_OPTIONS: SyncOptions = { batchSize: 300, pageSize: 500, overlapMs: 60_000 };

export interface SyncReport {
  sent: number;
  failed: number;
  received: number;
}

/**
 * Moves rows between this device's IndexedDB and the server for one store.
 * Push sends rows marked pending; pull applies rows changed on the server
 * since the last pull. Both are safe to repeat: rows are matched by id.
 */
export class SyncEngine {
  private readonly options: SyncOptions;

  constructor(
    private readonly database: PosDatabase,
    private readonly api: CloudApi,
    private readonly storeId: string,
    options: Partial<SyncOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async syncOnce(): Promise<SyncReport> {
    const pushed = await this.push();
    const received = await this.pull();
    await this.downloadMissingImages();
    await this.database.meta.put({ key: META_LAST_SYNC, value: nowIso() });
    return { ...pushed, received };
  }

  async push(): Promise<{ sent: number; failed: number }> {
    const attempted = new Set<string>();
    let sent = 0;
    let failed = 0;

    for (;;) {
      const batch = await this.collectPending(attempted);
      if (batch.size === 0) break;

      const changes: Record<string, ServerRow[]> = {};
      const failures = new Map<string, string>();
      for (const [name, rows] of batch) {
        rows.forEach((row) => attempted.add(row.id));
        const toSend =
          name === 'images' ? await this.uploadImages(rows as StoredImage[], failures) : rows;
        if (toSend.length) changes[SERVER_TABLE[name]] = toSend.map(toServerRow);
      }

      const result = Object.keys(changes).length
        ? await this.api.pushChanges(this.storeId, changes)
        : { failed: [], current: [] };
      for (const f of result.failed) failures.set(`${f.table}:${f.id}`, f.message);

      const tables = [...batch.keys()].map((name) => this.table(name));
      await this.database.transaction('rw', tables, async () => {
        const syncedAt = nowIso();
        for (const [name, rows] of batch) {
          const table = this.table(name);
          for (const row of rows) {
            const error = failures.get(`${SERVER_TABLE[name]}:${row.id}`);
            if (error !== undefined) {
              failed++;
              await table.update(row.id, { syncError: error });
              continue;
            }
            sent++;
            // Only clear the mark if nobody changed the row while it was being sent.
            const latest = await table.get(row.id);
            if (latest?.updatedAt === row.updatedAt) {
              await table.update(row.id, { pending: undefined, syncError: undefined, syncedAt });
            }
          }
        }
      });

      if (result.current.length) {
        const kept = new Map<SyncedTableName, ServerRow[]>();
        for (const { table, row } of result.current) {
          const name = LOCAL_TABLE[table];
          if (name) kept.set(name, [...(kept.get(name) ?? []), row]);
        }
        await this.applyServerRows(kept);
      }
    }
    return { sent, failed };
  }

  /** Returns how many rows changed on this device. */
  async pull(): Promise<number> {
    const saved =
      ((await this.database.meta.get(META_SYNC_CURSORS))?.value as
        Record<string, ServerCursor> | undefined) ?? {};
    const latest: Record<string, ServerCursor> = { ...saved };
    const request: Record<string, ServerCursor | null> = {};
    for (const name of SYNCED_TABLE_NAMES) {
      const cursor = saved[SERVER_TABLE[name]];
      request[SERVER_TABLE[name]] = cursor
        ? { ts: new Date(Date.parse(cursor.ts) - this.options.overlapMs).toISOString(), id: null }
        : null;
    }

    let written = 0;
    for (let page = 0; page < 10_000; page++) {
      const result = await this.api.pullChanges(this.storeId, request, this.options.pageSize);
      const grouped = new Map<SyncedTableName, ServerRow[]>();
      let more = false;
      for (const [serverTable, rows] of Object.entries(result)) {
        const name = LOCAL_TABLE[serverTable];
        const last = rows[rows.length - 1];
        if (!name || !last) continue;
        grouped.set(name, rows);
        const cursor = { ts: String(last.synced_at), id: String(last.id) };
        request[serverTable] = cursor;
        latest[serverTable] = cursor;
        if (rows.length >= this.options.pageSize) more = true;
      }
      written += await this.applyServerRows(grouped);
      await this.database.meta.put({ key: META_SYNC_CURSORS, value: latest });
      if (!more) break;
    }
    return written;
  }

  /** Fetches the files of images another device added. */
  async downloadMissingImages(): Promise<void> {
    const missing = await this.database.images
      .filter((i) => i.blob === null && !i.deletedAt && i.storeId === this.storeId)
      .toArray();
    for (const image of missing) {
      const blob = await this.api.downloadImage(this.storeId, image.id);
      if (blob) await this.database.images.update(image.id, { blob });
    }
  }

  private table(name: SyncedTableName): Table<SyncedRow, string> {
    return this.database.table(name);
  }

  private async collectPending(skip: Set<string>): Promise<Map<SyncedTableName, SyncedRow[]>> {
    const batch = new Map<SyncedTableName, SyncedRow[]>();
    let room = this.options.batchSize;
    for (const name of SYNCED_TABLE_NAMES) {
      if (room <= 0) break;
      const rows = await this.table(name)
        .where('pending')
        .equals(1)
        .filter((row) => row.storeId === this.storeId && !skip.has(row.id))
        .limit(room)
        .toArray();
      if (rows.length) {
        batch.set(name, rows);
        room -= rows.length;
      }
    }
    return batch;
  }

  /** Uploads image files before their rows, so a row never points at a missing file. */
  private async uploadImages(
    images: StoredImage[],
    failures: Map<string, string>,
  ): Promise<StoredImage[]> {
    const ready: StoredImage[] = [];
    for (const image of images) {
      if (image.blob && !image.deletedAt) {
        try {
          await this.api.uploadImage(this.storeId, image.id, image.blob);
        } catch (e) {
          if (e instanceof CloudError && e.kind === 'rejected') {
            failures.set(`${SERVER_TABLE.images}:${image.id}`, e.message);
            continue;
          }
          throw e;
        }
      }
      ready.push(image);
    }
    return ready;
  }

  private async applyServerRows(grouped: Map<SyncedTableName, ServerRow[]>): Promise<number> {
    let written = 0;
    for (const [name, rows] of grouped) {
      const table = this.table(name);
      const kind = tableKind(name);
      await this.database.transaction('rw', table, async () => {
        const remote = rows.map((row) => fromServerRow<SyncedRow>(row));
        const locals = await table.bulkGet(remote.map((row) => row.id));
        const toPut: SyncedRow[] = [];
        remote.forEach((row, i) => {
          const local = locals[i];
          const merged = mergeRemote(kind, local, row);
          if (!merged) return;
          if (name === 'images') {
            (merged as StoredImage).blob = (local as StoredImage | undefined)?.blob ?? null;
          }
          toPut.push(merged);
        });
        if (toPut.length) await table.bulkPut(toPut);
        written += toPut.length;
      });
    }
    return written;
  }
}
