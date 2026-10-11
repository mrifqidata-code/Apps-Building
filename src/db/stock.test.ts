import { afterEach, describe, expect, it } from 'vitest';
import { demoDatabase } from '../test/db';
import { saveProduct } from './catalog-admin';
import { EMPTY_CART, cartReducer } from './cart';
import { completeSale } from './checkout';
import { openShift } from './shift';
import {
  StockError,
  addStockIn,
  loadProductStock,
  loadStockLevels,
  recordStockOpname,
} from './stock';

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function setup() {
  const demo = await demoDatabase();
  cleanup = () => demo.database.delete();
  const { database, storeId, deviceId, owner, cashier } = demo;
  // Croissant Butter is the demo product that tracks stock (threshold 5).
  const croissant = demo.product('Croissant Butter');
  const stockIn = (qty: number, now = '2026-10-11T01:00:00.000Z', productId = croissant.id) =>
    addStockIn(database, {
      storeId,
      productId,
      qty,
      note: 'Dari supplier',
      userId: cashier.id,
      now,
    });
  const opname = (
    countedQty: number,
    now = '2026-10-11T05:00:00.000Z',
    role: 'owner' | 'cashier' = 'owner',
  ) =>
    recordStockOpname(database, {
      storeId,
      productId: croissant.id,
      countedQty,
      note: 'Hitung sore',
      actor: { userId: role === 'owner' ? owner.id : cashier.id, deviceId, role },
      now,
    });
  const sell = async (qty: number, now = '2026-10-11T03:00:00.000Z') => {
    await openShift(database, { storeId, deviceId, userId: cashier.id, openingCash: 0, now });
    let cart = EMPTY_CART;
    for (let i = 0; i < qty; i++)
      cart = cartReducer(cart, { type: 'add', productId: croissant.id });
    return completeSale(database, {
      storeId,
      deviceId,
      cashier: { id: cashier.id, role: 'cashier' },
      cart,
      paymentMethod: 'cash',
      amountPaid: 1_000_000,
      now,
    });
  };
  return { ...demo, croissant, stockIn, opname, sell };
}

describe('stock', () => {
  it('goes up with stok masuk and down with sales', async () => {
    const { database, storeId, croissant, stockIn, sell } = await setup();
    expect(await loadProductStock(database, croissant.id)).toBe(0);
    const movement = await stockIn(12);
    expect(movement).toMatchObject({ type: 'in', qtyDelta: 12, note: 'Dari supplier', pending: 1 });
    await sell(3);
    expect(await loadProductStock(database, croissant.id)).toBe(9);
    // Only products that track stock are listed.
    expect(await loadStockLevels(database, storeId)).toEqual(new Map([[croissant.id, 9]]));
  });

  it('lets only the owner do a stock opname, and logs it', async () => {
    const { database, croissant, stockIn, opname, sell } = await setup();
    await stockIn(12);
    await sell(2);
    await expect(opname(9, undefined, 'cashier')).rejects.toThrow(
      'Stok opname hanya bisa dilakukan pemilik.',
    );

    const counted = await opname(9);
    expect(counted).toMatchObject({ type: 'opname', countedQty: 9, qtyDelta: -1 });
    expect(await loadProductStock(database, croissant.id)).toBe(9);
    const [audit] = await database.auditLog.where({ entityId: croissant.id }).toArray();
    expect(audit).toMatchObject({
      action: 'stock_opname',
      before: { stock: 10 },
      after: { stock: 9 },
      reason: 'Hitung sore',
    });

    await sell(1, '2026-10-11T06:00:00.000Z');
    expect(await loadProductStock(database, croissant.id)).toBe(8);
  });

  it('refuses products that do not track stock and bad quantities', async () => {
    const { product, stockIn, opname } = await setup();
    await expect(stockIn(5, undefined, product('Espresso').id)).rejects.toThrow(
      'Stok Espresso tidak dilacak.',
    );
    await expect(stockIn(0)).rejects.toThrow(StockError);
    await expect(stockIn(1.5)).rejects.toThrow('angka bulat');
    await expect(opname(-1)).rejects.toThrow('mulai dari 0');
    // Counting zero is fine: the shelf is empty.
    await expect(opname(0)).resolves.toMatchObject({ countedQty: 0 });
  });
});

describe('saveProduct with stock', () => {
  it('turns on stock tracking with a starting count and a low-stock threshold', async () => {
    const { database, storeId, deviceId, owner, product } = await setup();
    const espresso = product('Espresso');
    await saveProduct(
      database,
      storeId,
      {
        id: espresso.id,
        categoryId: espresso.categoryId,
        name: espresso.name,
        price: espresso.price,
        cost: espresso.cost,
        imageId: null,
        active: true,
        groups: [],
        trackStock: true,
        lowStockThreshold: 3,
        startingStock: 20,
      },
      { userId: owner.id, deviceId },
      '2026-10-11T02:00:00.000Z',
    );
    expect(await database.products.get(espresso.id)).toMatchObject({
      trackStock: true,
      lowStockThreshold: 3,
    });
    expect(await loadProductStock(database, espresso.id)).toBe(20);
    const [movement] = await database.stockMovements.where({ productId: espresso.id }).toArray();
    expect(movement).toMatchObject({ type: 'opname', countedQty: 20, note: 'Stok awal' });
  });

  it('keeps the stock settings when they are left out, and validates them', async () => {
    const { database, storeId, deviceId, owner, croissant } = await setup();
    const input = {
      id: croissant.id,
      categoryId: croissant.categoryId,
      name: croissant.name,
      price: croissant.price,
      cost: croissant.cost,
      imageId: null,
      active: true,
      groups: [],
    };
    const actor = { userId: owner.id, deviceId };
    await saveProduct(database, storeId, input, actor, '2026-10-11T02:00:00.000Z');
    expect(await database.products.get(croissant.id)).toMatchObject({
      trackStock: true,
      lowStockThreshold: 5,
    });
    await expect(
      saveProduct(
        database,
        storeId,
        { ...input, lowStockThreshold: 2.5 },
        actor,
        '2026-10-11T03:00:00.000Z',
      ),
    ).rejects.toThrow('Batas stok menipis harus angka bulat');
  });
});
