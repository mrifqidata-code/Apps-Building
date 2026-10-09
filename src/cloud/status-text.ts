import type { SyncStatus } from './sync-manager';

/** Short Indonesian label for the sync state, shown in the header and settings. */
export function syncLabel(status: SyncStatus, online: boolean): string {
  const waiting = status.pending - status.failed;
  switch (status.phase) {
    case 'off':
      return online ? 'Online' : 'Offline';
    case 'revoked':
      return 'Diputus pemilik';
    case 'signed-out':
      return 'Perlu masuk lagi';
    case 'syncing':
      return 'Menyinkron…';
    case 'error':
      return 'Sinkron gagal';
    case 'offline':
    case 'idle':
      // Counts are rows, not sales, so the header only says whether something is waiting.
      if (!online || status.phase === 'offline') {
        return waiting > 0 ? 'Offline · belum terkirim' : 'Offline';
      }
      if (waiting > 0) return 'Belum terkirim';
      if (status.failed > 0) return 'Ada data ditolak';
      return 'Tersinkron';
  }
}

/** Dot colour next to the label. */
export function syncTone(status: SyncStatus, online: boolean): 'ok' | 'wait' | 'bad' {
  if (status.phase === 'revoked' || status.phase === 'error' || status.failed > 0) return 'bad';
  if (!online || status.phase === 'offline' || status.phase === 'signed-out') return 'wait';
  return status.pending > status.failed ? 'wait' : 'ok';
}
