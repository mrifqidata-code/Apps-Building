import type { SyncedRow, Transaction } from '../db/schema';
import type { TableKind } from './mapping';

const sameVersion = (a: SyncedRow, b: SyncedRow) =>
  a.updatedAt === b.updatedAt && a.syncedAt === b.syncedAt;

/**
 * Decides what to keep on this device when the server sends a row
 * (the device-side half of the rules in docs/sinkron.md).
 * Returns the row to store, or null to keep the local row as it is.
 */
export function mergeRemote<T extends SyncedRow>(
  kind: TableKind,
  local: T | undefined,
  remote: T,
): T | null {
  if (!local) return remote;
  switch (kind) {
    case 'append':
      // Written once on one device; the copy here is already the same row.
      return null;
    case 'transaction': {
      const mine = local as unknown as Transaction;
      const theirs = remote as unknown as Transaction;
      // A void or refund done on another device always reaches this one.
      if (mine.status === 'paid' && theirs.status !== 'paid') return remote;
      // Our own void/refund is still on its way to the server.
      if (local.pending) return null;
      return sameVersion(local, remote) ? null : remote;
    }
    case 'lww':
      // A newer local edit is still on its way; the server will take it.
      if (local.pending && local.updatedAt > remote.updatedAt) return null;
      if (!local.pending && sameVersion(local, remote)) return null;
      return remote;
  }
}
