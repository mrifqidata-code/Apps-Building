import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PosDatabase } from './db';
import { allocateReceiptNumber } from './receipt';

let database: PosDatabase;

beforeEach(() => {
  database = new PosDatabase(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('allocateReceiptNumber', () => {
  const morning = '2026-10-08T01:00:00.000Z';
  const nextDay = '2026-10-08T18:00:00.000Z'; // 01:00 WIB on 9 Oct

  it('counts up per device and restarts on a new WIB day', async () => {
    expect(await allocateReceiptNumber(database, 'K1', morning)).toBe('K1-261008-0001');
    expect(await allocateReceiptNumber(database, 'K1', morning)).toBe('K1-261008-0002');
    expect(await allocateReceiptNumber(database, 'K2', morning)).toBe('K2-261008-0001');
    expect(await allocateReceiptNumber(database, 'K1', nextDay)).toBe('K1-261009-0001');
  });

  it('never hands out the same number to concurrent sales', async () => {
    const numbers = await Promise.all(
      Array.from({ length: 25 }, () => allocateReceiptNumber(database, 'K1', morning)),
    );
    expect(new Set(numbers).size).toBe(25);
  });

  it('rolls the counter back when the surrounding sale fails', async () => {
    await expect(
      database.transaction('rw', database.counters, database.transactions, async () => {
        await allocateReceiptNumber(database, 'K1', morning);
        throw new Error('penyimpanan gagal');
      }),
    ).rejects.toThrow('penyimpanan gagal');
    expect(await allocateReceiptNumber(database, 'K1', morning)).toBe('K1-261008-0001');
  });
});
