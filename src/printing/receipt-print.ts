import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { encodePrintJob, rgbaToRaster, type Raster } from '../domain/escpos';
import { buildReceiptLines, buildTestPageLines } from '../domain/receipt-layout';
import type { ReceiptView } from '../domain/receipt-text';
import { nowIso } from '../domain/time';
import { PrinterManager } from './printer';

/** One printer connection for the whole app (per browser tab). */
export const printer = new PrinterManager(db);

export function usePrinterStatus() {
  return useSyncExternalStore(printer.subscribe, printer.getStatus, printer.getStatus);
}

/** Logo width in printer dots; 58 mm paper is 384 dots wide. */
const LOGO_MAX_DOTS = 256;

/** Turns the stored logo into a black-and-white raster the printer understands. */
export async function loadLogoRaster(imageId: string | null): Promise<Raster | null> {
  if (!imageId) return null;
  const image = await db.images.get(imageId);
  if (!image || image.deletedAt) return null;
  const bitmap = await createImageBitmap(image.blob);
  const scale = Math.min(1, LOGO_MAX_DOTS / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return rgbaToRaster(context.getImageData(0, 0, width, height).data, width, height);
}

export async function printReceipt(
  view: ReceiptView,
  logoImageId: string | null,
  options: { allowPicker?: boolean } = {},
) {
  const logo = await loadLogoRaster(logoImageId).catch(() => null);
  await printer.print(encodePrintJob(buildReceiptLines(view), logo), options);
}

export async function printTestPage(storeName: string, logoImageId: string | null) {
  const logo = await loadLogoRaster(logoImageId).catch(() => null);
  await printer.print(encodePrintJob(buildTestPageLines(storeName, nowIso()), logo), {
    allowPicker: true,
  });
}
