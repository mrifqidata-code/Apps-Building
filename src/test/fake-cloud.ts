import type { CloudApi, PushResult, ServerCursor } from '../cloud/api';
import { LOCAL_TABLE, SERVER_TABLE, tableKind, type ServerRow } from '../cloud/mapping';

const after = (row: ServerRow, cursor: ServerCursor) => {
  const ts = Date.parse(String(row.synced_at)) - Date.parse(cursor.ts);
  return ts > 0 || (ts === 0 && String(row.id) > (cursor.id ?? ''));
};

const order = (a: ServerRow, b: ServerRow) =>
  Date.parse(String(a.synced_at)) - Date.parse(String(b.synced_at)) ||
  String(a.id).localeCompare(String(b.id));

/**
 * In-memory stand-in for the Supabase sync API with the same conflict rules
 * as the SQL triggers, for fast unit tests. The real thing is covered by
 * *.cloud.test.ts against a local Supabase.
 */
export class FakeCloud implements CloudApi {
  readonly tables = new Map<string, Map<string, ServerRow>>();
  readonly files = new Map<string, Blob>();
  /** Row ids the server will refuse, as RLS or a constraint would. */
  readonly refuse = new Set<string>();
  /**
   * Tables the server has. Like the real push_changes, rows of other tables
   * are skipped without an error (a server whose newest SQL file is not pasted yet).
   */
  readonly serverTables = new Set<string>(Object.values(SERVER_TABLE));
  pushCalls = 0;
  private clock = Date.UTC(2026, 9, 9);

  rows(table: string): ServerRow[] {
    return [...(this.tables.get(table)?.values() ?? [])];
  }

  private stamp(): string {
    this.clock += 1;
    return new Date(this.clock).toISOString().replace('Z', '+00:00');
  }

  private table(name: string) {
    let table = this.tables.get(name);
    if (!table) this.tables.set(name, (table = new Map()));
    return table;
  }

  async pushChanges(_storeId: string, changes: Record<string, ServerRow[]>): Promise<PushResult> {
    this.pushCalls++;
    const result: PushResult = { failed: [], current: [] };
    for (const [name, rows] of Object.entries(changes)) {
      if (!this.serverTables.has(name)) continue;
      const table = this.table(name);
      const kind = tableKind(LOCAL_TABLE[name]!);
      for (const row of rows) {
        const id = String(row.id);
        if (this.refuse.has(id)) {
          result.failed.push({ table: name, id, code: '42501', message: 'ditolak server' });
          continue;
        }
        const existing = table.get(id);
        if (!existing) {
          table.set(id, { ...row, synced_at: this.stamp() });
        } else if (kind === 'append') {
          // Already there; nothing changes.
        } else if (kind === 'transaction') {
          if (existing.status === 'paid' && row.status !== 'paid') {
            table.set(id, {
              ...existing,
              status: row.status,
              void_reason: row.void_reason,
              voided_by: row.voided_by,
              voided_at: row.voided_at,
              updated_at: row.updated_at,
              synced_at: this.stamp(),
            });
          } else {
            result.current.push({ table: name, row: existing });
          }
        } else if (String(row.updated_at) > String(existing.updated_at)) {
          table.set(id, { ...row, synced_at: this.stamp() });
        } else {
          result.current.push({ table: name, row: existing });
        }
      }
    }
    return result;
  }

  async pullChanges(
    _storeId: string,
    cursors: Record<string, ServerCursor | null>,
    limit: number,
  ): Promise<Record<string, ServerRow[]>> {
    const out: Record<string, ServerRow[]> = {};
    for (const name of this.serverTables) {
      const cursor = cursors[name];
      out[name] = [...this.table(name).values()]
        .filter((row) => !cursor || after(row, cursor))
        .sort(order)
        .slice(0, limit);
    }
    return out;
  }

  async uploadImage(storeId: string, imageId: string, blob: Blob): Promise<void> {
    this.files.set(`${storeId}/${imageId}`, blob);
  }

  async downloadImage(storeId: string, imageId: string): Promise<Blob | null> {
    return this.files.get(`${storeId}/${imageId}`) ?? null;
  }
}
