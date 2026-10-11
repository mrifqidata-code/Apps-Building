import { afterEach, describe, expect, it } from 'vitest';
import { demoDatabase } from '../test/db';
import { EMPTY_CART, cartReducer } from './cart';
import { completeSale } from './checkout';
import {
  addCashMovement,
  closeShift,
  getOpenShift,
  loadShiftSummary,
  openShift,
  ShiftError,
} from './shift';

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function setup() {
  const demo = await demoDatabase();
  cleanup = () => demo.database.delete();
  const { database, storeId, deviceId, cashier } = demo;
  const open = (openingCash = 200_000, now = '2026-10-08T01:00:00.000Z') =>
    openShift(database, { storeId, deviceId, userId: cashier.id, openingCash, now });
  const cash = (type: 'in' | 'out', amount: number, reason = 'Beli es batu') =>
    addCashMovement(database, {
      storeId,
      deviceId,
      userId: cashier.id,
      type,
      amount,
      reason,
      now: '2026-10-08T02:00:00.000Z',
    });
  const sell = (productName: string, paymentMethod: 'cash' | 'qris', amountPaid: number) =>
    completeSale(database, {
      storeId,
      deviceId,
      cashier: { id: cashier.id, role: 'cashier' },
      cart: cartReducer(EMPTY_CART, { type: 'add', productId: demo.product(productName).id }),
      paymentMethod,
      amountPaid,
      now: '2026-10-08T03:00:00.000Z',
    });
  const close = (shiftId: string, countedCash: number, note = '') =>
    closeShift(database, {
      shiftId,
      userId: cashier.id,
      countedCash,
      note,
      now: '2026-10-08T10:00:00.000Z',
    });
  return { ...demo, open, cash, sell, close };
}

describe('shifts', () => {
  it('opens one shift per device, waiting to be synced', async () => {
    const { database, deviceId, open } = await setup();
    expect(await getOpenShift(database, deviceId)).toBeUndefined();
    const shift = await open();
    expect(shift).toMatchObject({ openingCash: 200_000, closedAt: null, pending: 1 });
    // Opening again (a double tap) keeps the same shift.
    expect((await open(50_000)).id).toBe(shift.id);
    expect(await database.shifts.count()).toBe(1);
    expect((await getOpenShift(database, deviceId))?.id).toBe(shift.id);
  });

  it('closes with the expected cash, the counted cash and the difference', async () => {
    const { database, deviceId, open, cash, sell, close } = await setup();
    const shift = await open(200_000);
    await sell('Espresso', 'cash', 20_000); // 15.000 in the drawer, 5.000 change
    await sell('Americano', 'cash', 18_000);
    await sell('Cappuccino', 'qris', 25_000);
    await cash('out', 10_000);
    await cash('in', 50_000, 'Tambah uang kecil');

    const { shift: closed, summary } = await close(shift.id, 270_000, '  Kurang 3 ribu  ');

    // 200.000 + 15.000 + 18.000 + 50.000 - 10.000
    expect(summary).toMatchObject({ cashSales: 33_000, cashIn: 50_000, cashOut: 10_000 });
    expect(closed).toMatchObject({
      closedAt: '2026-10-08T10:00:00.000Z',
      expectedCash: 273_000,
      countedCash: 270_000,
      cashDifference: -3_000,
      note: 'Kurang 3 ribu',
      pending: 1,
    });
    expect(await database.shifts.get(shift.id)).toEqual(closed);
    expect(await getOpenShift(database, deviceId)).toBeUndefined();
    expect((await loadShiftSummary(database, closed)).salesByMethod.qris.total).toBe(25_000);
  });

  it('refuses to close twice', async () => {
    const { open, close } = await setup();
    const shift = await open();
    await close(shift.id, 200_000);
    await expect(close(shift.id, 200_000)).rejects.toThrow('Kasir ini sudah ditutup.');
  });

  it('records kas masuk/keluar only while the drawer is open, with a reason', async () => {
    const { database, open, cash, close } = await setup();
    await expect(cash('out', 10_000)).rejects.toThrow('Kasir belum dibuka.');
    const shift = await open();
    const movement = await cash('out', 10_000, '  Beli galon ');
    expect(movement).toMatchObject({ shiftId: shift.id, reason: 'Beli galon', pending: 1 });
    await expect(cash('out', 0)).rejects.toThrow(ShiftError);
    await expect(cash('in', 5_000, '   ')).rejects.toThrow('Tulis alasannya');
    await expect(cash('in', 5_000, 'x'.repeat(81))).rejects.toThrow('maksimal 80');
    await close(shift.id, 190_000);
    await expect(cash('in', 5_000)).rejects.toThrow('Kasir belum dibuka.');
    expect(await database.cashMovements.count()).toBe(1);
  });

  it('rejects negative or fractional money', async () => {
    const { open, close } = await setup();
    await expect(open(-1)).rejects.toThrow('tidak boleh negatif');
    const shift = await open();
    await expect(close(shift.id, -5)).rejects.toThrow('tidak boleh negatif');
    await expect(close(shift.id, 1.5)).rejects.toThrow(RangeError);
  });
});
