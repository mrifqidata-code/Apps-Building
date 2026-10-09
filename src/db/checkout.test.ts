import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_CART, cartReducer, type Cart } from './cart';
import { completeSale, type SaleInput } from './checkout';
import { demoDatabase } from '../test/db';

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function setup() {
  const demo = await demoDatabase();
  cleanup = () => demo.database.delete();
  const sale = (cart: Cart, overrides: Partial<SaleInput> = {}) =>
    completeSale(demo.database, {
      storeId: demo.storeId,
      deviceId: demo.deviceId,
      cashier: { id: demo.cashier.id, role: 'cashier' },
      cart,
      paymentMethod: 'cash',
      amountPaid: 100_000,
      now: '2026-10-08T07:30:00.000Z',
      ...overrides,
    });
  return { ...demo, sale };
}

const add = (cart: Cart, productId: string, variantIds?: string[]) =>
  cartReducer(cart, { type: 'add', productId, variantIds });

describe('completeSale', () => {
  it('stores the transaction, items with price snapshots and a receipt number', async () => {
    const { database, sale, product, variantsOf } = await setup();
    const v = await variantsOf('Kopi Susu Gula Aren');
    let cart = add(EMPTY_CART, product('Kopi Susu Gula Aren').id, [v('Large')]);
    cart = add(cart, product('Kopi Susu Gula Aren').id, [v('Large')]);
    cart = add(cart, product('Espresso').id);

    const tx = await sale(cart);

    expect(tx.receiptNo).toBe('K1-261008-0001');
    expect(tx.total).toBe(2 * 27_000 + 15_000);
    expect(tx.changeAmount).toBe(100_000 - 69_000);
    expect(tx.status).toBe('paid');
    expect(tx.syncedAt).toBeNull();

    const stored = await database.transactions.get(tx.id);
    expect(stored).toEqual(tx);
    const items = await database.transactionItems.where({ transactionId: tx.id }).toArray();
    expect(items.map((i) => [i.productName, i.qty, i.unitPrice, i.unitCost])).toEqual([
      ['Kopi Susu Gula Aren', 2, 27_000, 10_000],
      ['Espresso', 1, 15_000, 5_000],
    ]);
    expect(items[0]!.variants).toEqual([
      { groupName: 'Ukuran', name: 'Large', priceDelta: 5_000, costDelta: 2_000 },
    ]);
  });

  it('keeps history unchanged when a price is edited later', async () => {
    const { database, sale, product } = await setup();
    const espresso = product('Espresso');
    const tx = await sale(add(EMPTY_CART, espresso.id));
    await database.products.update(espresso.id, { price: 99_000, name: 'Espresso Baru' });

    const [item] = await database.transactionItems.where({ transactionId: tx.id }).toArray();
    expect(item!.unitPrice).toBe(15_000);
    expect(item!.productName).toBe('Espresso');
  });

  it('numbers receipts in sequence', async () => {
    const { sale, product } = await setup();
    const cart = add(EMPTY_CART, product('Espresso').id);
    const numbers = [];
    for (let i = 0; i < 3; i++) numbers.push((await sale(cart)).receiptNo);
    expect(numbers).toEqual(['K1-261008-0001', 'K1-261008-0002', 'K1-261008-0003']);
  });

  it('records stock movements only for products that track stock', async () => {
    const { database, sale, product } = await setup();
    let cart = add(EMPTY_CART, product('Croissant Butter').id);
    cart = add(cart, product('Croissant Butter').id);
    cart = add(cart, product('Espresso').id);
    const tx = await sale(cart);

    const movements = await database.stockMovements.toArray();
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      productId: product('Croissant Butter').id,
      type: 'sale',
      qtyDelta: -2,
      transactionId: tx.id,
    });
  });

  it('accepts QRIS and transfer only for the exact total', async () => {
    const { sale, product } = await setup();
    const cart = add(EMPTY_CART, product('Espresso').id);
    await expect(sale(cart, { paymentMethod: 'qris', amountPaid: 20_000 })).rejects.toThrow(
      'Jumlah pembayaran harus sama dengan total.',
    );
    const tx = await sale(cart, { paymentMethod: 'transfer', amountPaid: 15_000 });
    expect(tx.changeAmount).toBe(0);
  });

  it('refuses cash below the total and saves nothing', async () => {
    const { database, sale, product } = await setup();
    await expect(
      sale(add(EMPTY_CART, product('Espresso').id), { amountPaid: 10_000 }),
    ).rejects.toThrow('Uang yang diterima kurang.');
    expect(await database.transactions.count()).toBe(0);
    expect(await database.counters.count()).toBe(0);
  });

  it('enforces the cashier discount limit but lets the owner discount', async () => {
    const { sale, product, owner } = await setup();
    const cart = cartReducer(add(EMPTY_CART, product('Espresso').id), {
      type: 'setDiscount',
      discount: { type: 'amount', value: 5_000 },
    });
    await expect(sale(cart)).rejects.toThrow('Diskon melebihi batas kasir.');
    const tx = await sale(cart, { cashier: { id: owner.id, role: 'owner' } });
    expect(tx.discountAmount).toBe(5_000);
    expect(tx.total).toBe(10_000);
  });

  it('refuses an empty cart and inactive products', async () => {
    const { database, sale, product } = await setup();
    await expect(sale(EMPTY_CART)).rejects.toThrow('Keranjang masih kosong.');
    await database.products.update(product('Espresso').id, { active: false });
    await expect(sale(add(EMPTY_CART, product('Espresso').id))).rejects.toThrow(
      'Produk di keranjang sudah tidak dijual.',
    );
  });

  it('snapshots the store tax settings', async () => {
    const { database, storeId, sale, product } = await setup();
    await database.stores.update(storeId, { serviceBps: 500, pb1Bps: 1_000 });
    const tx = await sale(add(EMPTY_CART, product('Espresso').id));
    // 15.000 + 750 service + 1.575 PB1
    expect([tx.serviceBps, tx.serviceAmount, tx.taxBps, tx.taxAmount, tx.total]).toEqual([
      500, 750, 1_000, 1_575, 17_325,
    ]);
  });
});
