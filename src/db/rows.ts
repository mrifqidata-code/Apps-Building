import { uuidv7 } from '../domain/id';
import type { IsoDateTime } from '../domain/time';
import type { SyncedRow } from './schema';

/**
 * Sync columns for a brand-new row. Every local write goes through newRow or
 * touched, which mark the row pending so the sync engine sends it.
 */
export function newRow(storeId: string, now: IsoDateTime): SyncedRow {
  return {
    id: uuidv7(),
    storeId,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    deletedAt: null,
    pending: 1,
  };
}

/** Sync columns after a local change: newer updatedAt and not yet synced. */
export function touched(now: IsoDateTime): Pick<SyncedRow, 'updatedAt' | 'syncedAt' | 'pending'> {
  return { updatedAt: now, syncedAt: null, pending: 1 };
}

export function isLive(row: { deletedAt: string | null }): boolean {
  return row.deletedAt === null;
}
