import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import { db } from '../db/db';

/** Object URL for an image stored on the device, revoked when no longer shown. */
export function useImageUrl(imageId: string | null | undefined): string | null {
  const image = useLiveQuery(
    async () => (imageId ? ((await db.images.get(imageId)) ?? null) : null),
    [imageId],
  );
  const url = useMemo(
    () => (image && !image.deletedAt ? URL.createObjectURL(image.blob) : null),
    [image],
  );
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

/**
 * Shrinks a photo before storing it, so a 12 MP camera shot does not fill
 * the phone's storage. Keeps the aspect ratio; never enlarges.
 */
export async function resizeImage(file: Blob, maxSize: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak bisa memproses gambar.');
  // White background so transparent PNGs (like many QRIS images) stay readable as JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal menyimpan gambar.'))),
      'image/jpeg',
      quality,
    ),
  );
}
