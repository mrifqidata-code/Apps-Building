import { formatReceiptNumber, receiptCounterKey } from '../domain/receipt-number';
import type { IsoDateTime } from '../domain/time';
import type { PosDatabase } from './db';

/**
 * Reserves the next receipt number for this device and WIB day.
 *
 * Call it inside the same Dexie read-write transaction that saves the sale
 * (including the `counters` table), so a crash can never leave a used
 * number without a sale, or two sales with one number.
 */
export async function allocateReceiptNumber(
  database: PosDatabase,
  deviceCode: string,
  at: IsoDateTime,
): Promise<string> {
  return database.transaction('rw', database.counters, async () => {
    const key = receiptCounterKey(deviceCode, at);
    const current = await database.counters.get(key);
    const next = (current?.value ?? 0) + 1;
    await database.counters.put({ key, value: next });
    return formatReceiptNumber(deviceCode, at, next);
  });
}
