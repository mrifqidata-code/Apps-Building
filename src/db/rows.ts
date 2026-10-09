import { uuidv7 } from '../domain/id';
import type { IsoDateTime } from '../domain/time';
import type { SyncedRow } from './schema';

/** Sync columns for a brand-new row. */
export function newRow(storeId: string, now: IsoDateTime): SyncedRow {
  return { id: uuidv7(), storeId, createdAt: now, updatedAt: now, syncedAt: null, deletedAt: null };
}

/** Sync columns after a local change: newer updatedAt and not yet synced. */
export function touched(now: IsoDateTime): Pick<SyncedRow, 'updatedAt' | 'syncedAt'> {
  return { updatedAt: now, syncedAt: null };
}

export function isLive(row: { deletedAt: string | null }): boolean {
  return row.deletedAt === null;
}
