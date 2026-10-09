import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudError, type CloudApi, type PushResult, type ServerCursor } from './api';
import type { ServerRow } from './mapping';

export const IMAGE_BUCKET = 'store-images';

interface ErrorLike {
  message: string;
  code?: string;
}

/** Turns a Supabase (PostgREST) error into something the sync manager can act on. */
export function toCloudError(error: ErrorLike, status?: number): CloudError {
  const code = error.code ?? '';
  if (!status) return new CloudError('offline', error.message, code);
  if (error.message === 'not_member') return new CloudError('not-member', error.message, code);
  if (status === 401 || code.startsWith('PGRST3')) {
    return new CloudError('signed-out', error.message, code);
  }
  if (status >= 500) return new CloudError('offline', error.message, code);
  return new CloudError('rejected', error.message, code);
}

interface StorageErrorLike {
  message: string;
  status?: number;
  statusCode?: string;
}

function storageError(error: StorageErrorLike): CloudError {
  const status = error.status ?? 0;
  const code = error.statusCode ?? String(status);
  if (!status) return new CloudError('offline', error.message, code);
  if (status === 401) return new CloudError('signed-out', error.message, code);
  if (status >= 500) return new CloudError('offline', error.message, code);
  return new CloudError('rejected', error.message, code);
}

const isStatus = (error: StorageErrorLike, status: string) =>
  error.statusCode === status || String(error.status) === status;

export class SupabaseCloudApi implements CloudApi {
  constructor(private readonly client: SupabaseClient) {}

  async pushChanges(storeId: string, changes: Record<string, ServerRow[]>): Promise<PushResult> {
    const { data, error, status } = await this.client.rpc('push_changes', {
      p_store_id: storeId,
      p_changes: changes,
    });
    if (error) throw toCloudError(error, status);
    return data as PushResult;
  }

  async pullChanges(
    storeId: string,
    cursors: Record<string, ServerCursor | null>,
    limit: number,
  ): Promise<Record<string, ServerRow[]>> {
    const { data, error, status } = await this.client.rpc('pull_changes', {
      p_store_id: storeId,
      p_cursors: cursors,
      p_limit: limit,
    });
    if (error) throw toCloudError(error, status);
    return data as Record<string, ServerRow[]>;
  }

  async uploadImage(storeId: string, imageId: string, blob: Blob): Promise<void> {
    const { error } = await this.client.storage
      .from(IMAGE_BUCKET)
      .upload(`${storeId}/${imageId}`, blob, { contentType: blob.type || 'image/jpeg' });
    // Images never change, so a file that is already there is the same file.
    if (error && !isStatus(error, '409')) throw storageError(error);
  }

  async downloadImage(storeId: string, imageId: string): Promise<Blob | null> {
    const { data, error } = await this.client.storage
      .from(IMAGE_BUCKET)
      .download(`${storeId}/${imageId}`);
    if (error) {
      if (isStatus(error, '404') || isStatus(error, '400')) return null;
      throw storageError(error);
    }
    return data;
  }
}
