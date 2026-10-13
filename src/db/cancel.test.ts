import { afterEach, describe, expect, it } from 'vitest';
import { demoDatabase } from '../test/db';
import { CancelError, cancelSale, planCancel } from './cancel';
import { EMPTY_CART, cartReducer } from './cart';
import { completeSale } from './checkout';
import { closeShift, getOpenShift, loadShiftSummary, openShift } from './shift';
import { addStockIn, loadProductStock } from './stock';

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function setup() {
  const demo = await demoDatabase();
  cleanup = () => demo.database.delete();
  const { database, storeId, deviceId, owner, cashier } = demo;
  const croissant = demo.product('Croissant Butter');
  await addStockIn(database, {
    storeId,
    productId: croissant.id,
    qty: 10,
    note: '',
    userId: cashier.id,
    now: '2026-10-13T00:00:00.000Z',
  });
  const open = (now = '2026-10-13T01:00:00.000Z') =>
    openShift(database, { storeId, deviceId, userId: cashier.id, openingCash: 100_000, now });
  const sell = (paymentMethod: 'cash' | 'qris' = 'cash', now = '2026-10-13T02:00:00.000Z') => {
    let cart = cartReducer(EMPTY_CART, { type: 'add', productId: croissant.id });
    cart = cartReducer(cart, { type: 'add', productId: croissant.id });
    cart = cartReducer(cart, { type: 'add', productId: demo.product('Espresso').id });
    return completeSale(database, {
      storeId,
      deviceId,
      cashier: { id: cashier.id, role: 'cashier' },
      cart,
      paymentMethod,
      // 2 x 22.000 + 15.000
      amountPaid: 59_000,
      now,
    });
  };
  const cancel = (
    transactionId: string,
    options: { restock?: boolean; role?: 'owner' | 'cashier'; reason?: string; now?: string } = {},
  ) =>
    cancelSale(database, {
      transactionId,
      reason: options.reason ?? 'Salah input',
      restock: options.restock ?? true,
      actor: {
        userId: options.role === 'cashier' ? cashier.id : owner.id,
        role: options.role ?? 'owner',
      },
      deviceId,
      now: options.now ?? '2026-10-13T03:00:00.000Z',
    });
  const close = async (now = '2026-10-13T05:00:00.000Z') => {
    const shift = (await getOpenShift(database, deviceId))!;
    return closeShift(database, {
      shiftId: shift.id,
      userId: cashier.id,
      countedCash: 0,
      note: '',
      now,
    });
  };
  return { ...demo, croissant, open, sell, cancel, close };
}

describe('cancelSale', () => {
  it('voids a sale of the open shift: out of the drawer count, goods back in stock', async () => {
    const { database, deviceId, owner, croissant, open, sell, cancel } = await setup();
    const shift = await open();
    const tx = await sell();
    expect(await loadProductStock(database, croissant.id)).toBe(8);
    expect((await planCancel(database, tx, deviceId)).kind).toBe('void');

    const result = await cancel(tx.id);

    expect(result.kind).toBe('void');
    expect(result.transaction).toMatchObject({
      status: 'void',
      voidReason: 'Salah input',
      voidedBy: owner.id,
      voidedAt: '2026-10-13T03:00:00.000Z',
      pending: 1,
    });
    expect(result.cashOut).toBeNull();
    expect(await loadProductStock(database, croissant.id)).toBe(10);
    // The drawer expects only the opening cash again.
    expect((await loadShiftSummary(database, shift)).expectedCash).toBe(100_000);
    const [audit] = await database.auditLog.where({ entityId: tx.id }).toArray();
    expect(audit).toMatchObject({
      action: 'void',
      actorId: owner.id,
      reason: 'Salah input',
      before: { status: 'paid', total: 59_000 },
      after: { status: 'void', restockedQty: 2, cashFromDrawer: 0 },
    });
  });

  it('refunds a sale of a closed shift from the drawer that is open now', async () => {
    const { database, deviceId, croissant, open, sell, cancel, close } = await setup();
    await open();
    const tx = await sell();
    await close();
    const today = await open('2026-10-13T06:00:00.000Z');
    expect(await planCancel(database, tx, deviceId)).toMatchObject({
      kind: 'refund',
      stockQty: 2,
      cashFromDrawer: { amount: 59_000, shiftId: today.id },
    });

    const result = await cancel(tx.id, { restock: false, reason: 'Pelanggan komplain' });

    expect(result.transaction.status).toBe('refunded');
    expect(result.cashOut).toMatchObject({
      shiftId: today.id,
      type: 'out',
      amount: 59_000,
      reason: `Refund ${tx.receiptNo}`,
    });
    // Not restocked: the croissants were eaten.
    expect(await loadProductStock(database, croissant.id)).toBe(8);
    expect((await loadShiftSummary(database, today)).expectedCash).toBe(100_000 - 59_000);
    const [audit] = await database.auditLog.where({ entityId: tx.id }).toArray();
    expect(audit).toMatchObject({ action: 'refund', after: { status: 'refunded' } });
  });

  it('refunds QRIS outside the drawer, and cash without an open drawer too', async () => {
    const { database, open, sell, cancel, close, croissant } = await setup();
    await open();
    const qris = await sell('qris');
    const cash = await sell('cash', '2026-10-13T02:30:00.000Z');
    await close();

    expect((await cancel(qris.id)).cashOut).toBeNull();
    // No drawer open on this phone: the refund is recorded, the money is not.
    const result = await cancel(cash.id, { now: '2026-10-13T07:00:00.000Z' });
    expect(result.cashOut).toBeNull();
    expect(await database.cashMovements.count()).toBe(0);
    expect(await loadProductStock(database, croissant.id)).toBe(10);
  });

  it('is owner only, needs a reason, and happens once', async () => {
    const { database, open, sell, cancel } = await setup();
    await open();
    const tx = await sell();
    await expect(cancel(tx.id, { role: 'cashier' })).rejects.toThrow(
      'Hanya pemilik yang bisa membatalkan transaksi.',
    );
    await expect(cancel(tx.id, { reason: '   ' })).rejects.toThrow('Tulis alasan');
    expect((await database.transactions.get(tx.id))?.status).toBe('paid');
    expect(await database.auditLog.count()).toBe(0);

    await cancel(tx.id);
    await expect(cancel(tx.id)).rejects.toThrow(CancelError);
    expect(await database.auditLog.count()).toBe(1);
  });
});
