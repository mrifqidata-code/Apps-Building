import type { ServerRow } from './mapping';

/** Position in a server table: the last row seen, in (synced_at, id) order. */
export interface ServerCursor {
  ts: string;
  id: string | null;
}

export interface PushResult {
  /** Rows the server refused (e.g. RLS or a constraint), with the reason. */
  failed: { table: string; id: string; code: string; message: string }[];
  /** The server's version of rows it kept instead of ours (an older edit, or a second void). */
  current: { table: string; row: ServerRow }[];
}

/** What the sync engine needs from the server. Supabase in the app, a fake in unit tests. */
export interface CloudApi {
  pushChanges(storeId: string, changes: Record<string, ServerRow[]>): Promise<PushResult>;
  pullChanges(
    storeId: string,
    cursors: Record<string, ServerCursor | null>,
    limit: number,
  ): Promise<Record<string, ServerRow[]>>;
  uploadImage(storeId: string, imageId: string, blob: Blob): Promise<void>;
  /** Null when the file is not on the server (yet). */
  downloadImage(storeId: string, imageId: string): Promise<Blob | null>;
}

/**
 * - offline: no connection; try again later.
 * - signed-out: the session on this device is gone.
 * - not-member: this device was disconnected by the owner (or never joined).
 * - rejected: the server refused the request itself.
 */
export type CloudErrorKind = 'offline' | 'signed-out' | 'not-member' | 'rejected';

export class CloudError extends Error {
  readonly kind: CloudErrorKind;
  readonly code: string;
  constructor(kind: CloudErrorKind, message: string, code = '') {
    super(message);
    this.name = 'CloudError';
    this.kind = kind;
    this.code = code;
  }
}
