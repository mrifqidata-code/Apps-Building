import type { IsoDateTime } from '../domain/time';
import type { PosDatabase } from './db';
import { newRow, touched } from './rows';
import type { StoredImage } from './schema';

/** Stores a (already resized) image on the device and returns its id. */
export async function saveImage(
  database: PosDatabase,
  storeId: string,
  blob: Blob,
  now: IsoDateTime,
): Promise<string> {
  const image: StoredImage = { ...newRow(storeId, now), blob, mimeType: blob.type || 'image/jpeg' };
  await database.images.add(image);
  return image.id;
}

export async function deleteImage(database: PosDatabase, imageId: string, now: IsoDateTime) {
  await database.images.update(imageId, { deletedAt: now, ...touched(now) });
}
