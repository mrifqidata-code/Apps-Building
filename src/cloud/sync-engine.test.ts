import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_CART, cartReducer } from '../db/cart';
import { completeSale } from '../db/checkout';
import { PosDatabase } from '../db/db';
import { saveImage } from '../db/images';
import { touched } from '../db/rows';
import { addCashMovement, openShift } from '../db/shift';
import { demoDatabase } from '../test/db';
import { FakeCloud } from '../test/fake-cloud';
import { META_SYNC_CURSORS, SyncEngine } from './sync-engine';

const databases: PosDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((d) => d.delete()));
});

async function setup() {
  const demo = await demoDatabase();
  databases.push(demo.database);
  const cloud = new FakeCloud();
  const engine = new SyncEngine(demo.database, cloud, demo.storeId, { pageSize: 4 });
  const other = new PosDatabase(`test-${crypto.randomUUID()}`);
  databases.push(other);
  const otherEngine = new SyncEngine(other, cloud, demo.storeId, { pageSize: 4 });
  const pendingCount = async (database: PosDatabase) => {
    let n = 0;
    for (const table of database.tables) {
      if (table.schema.indexes.some((i) => i.name === 'pending')) {
        n += await table.where('pending').equals(1).count();
      }
    }
    return n;
  };
  return { ...demo, cloud, engine, other, otherEngine, pendingCount };
}

describe('SyncEngine', () => {
  it('keeps kas masuk/keluar on the device until the server has their table', async () => {
    const { database, storeId, deviceId, cashier, cloud, engine, other, otherEngine } =
      await setup();
    // The owner has not pasted the M3 SQL file yet.
    cloud.serverTables.delete('cash_movements');
    await openShift(database, {
      storeId,
      deviceId,
      userId: cashier.id,
      openingCash: 100_000,
      now: '2026-10-09T02:00:00.000Z',
    });
    await addCashMovement(database, {
      storeId,
      deviceId,
      userId: cashier.id,
      type: 'out',
      amount: 15_000,
      reason: 'Beli es batu',
      now: '2026-10-09T03:00:00.000Z',
    });

    expect(await engine.syncOnce()).toMatchObject({ held: 1, failed: 0 });
    expect(await database.cashMovements.where('pending').equals(1).count()).toBe(1);
    expect(cloud.rows('shifts')).toHaveLength(1);

    cloud.serverTables.add('cash_movements');
    expect(await engine.syncOnce()).toMatchObject({ sent: 1, held: 0 });
    expect(await database.cashMovements.where('pending').equals(1).count()).toBe(0);
    await otherEngine.syncOnce();
    expect(await other.cashMovements.toArray()).toMatchObject([
      { type: 'out', amount: 15_000, reason: 'Beli es batu' },
    ]);
  });

  it('sends every pending row once and clears the marks', async () => {
    const { database, cloud, engine, pendingCount } = await setup();
    const before = await pendingCount(database);
    expect(before).toBeGreaterThan(0);

    const report = await engine.syncOnce();
    expect(report).toMatchObject({ sent: before, failed: 0 });
    expect(await pendingCount(database)).toBe(0);
    expect(cloud.rows('products')).toHaveLength(15);
    expect(cloud.rows('product_variants')[0]).toHaveProperty('price_delta');

    const calls = cloud.pushCalls;
    expect(await engine.syncOnce()).toMatchObject({ sent: 0, received: 0 });
    expect(cloud.pushCalls).toBe(calls);
  });

  it('pulls everything in pages into an empty device', async () => {
    const { database, engine, other, otherEngine } = await setup();
    await engine.syncOnce();
    const received = await otherEngine.pull();

    expect(received).toBe(await countAll(database));
    expect(await other.products.count()).toBe(15);
    expect(await other.products.where('pending').equals(1).count()).toBe(0);
    const cursors = (await other.meta.get(META_SYNC_CURSORS))?.value as Record<string, unknown>;
    expect(Object.keys(cursors)).toContain('products');
  });

  it('keeps a change made while the row was being sent', async () => {
    const { database, cloud, engine, product } = await setup();
    const espresso = product('Espresso').id;
    const push = cloud.pushChanges.bind(cloud);
    cloud.pushChanges = async (storeId, changes) => {
      // The cashier edits the product while the request is in flight.
      await database.products.update(espresso, {
        price: 16_000,
        ...touched('2026-10-09T09:00:00.000Z'),
      });
      cloud.pushChanges = push;
      return push(storeId, changes);
    };
    await engine.push();
    expect((await database.products.get(espresso))?.pending).toBe(1);
    await engine.push();
    expect((await database.products.get(espresso))?.pending).toBeUndefined();
    expect(cloud.rows('products').find((p) => p.id === espresso)?.price).toBe(16_000);
  });

  it('marks refused rows and keeps retrying them without blocking others', async () => {
    const { database, cloud, engine, product } = await setup();
    const espresso = product('Espresso').id;
    cloud.refuse.add(espresso);

    const report = await engine.push();
    expect(report.failed).toBe(1);
    expect(await database.products.get(espresso)).toMatchObject({
      pending: 1,
      syncError: 'ditolak server',
    });
    expect(cloud.rows('products')).toHaveLength(14);

    cloud.refuse.clear();
    await engine.push();
    const row = await database.products.get(espresso);
    expect(row?.pending).toBeUndefined();
    expect(row?.syncError).toBeUndefined();
  });

  it('takes the server version back when it kept a newer edit', async () => {
    const { database, engine, other, otherEngine, product } = await setup();
    const espresso = product('Espresso').id;
    await engine.syncOnce();
    await otherEngine.pull();

    await other.products.update(espresso, {
      price: 18_000,
      ...touched('2026-10-09T10:00:00.000Z'),
    });
    await otherEngine.push();
    await database.products.update(espresso, {
      price: 16_000,
      ...touched('2026-10-09T09:00:00.000Z'),
    });
    await engine.push();

    expect(await database.products.get(espresso)).toMatchObject({ price: 18_000 });
    expect((await database.products.get(espresso))?.pending).toBeUndefined();
  });

  it('never duplicates sales, even when a sync is repeated', async () => {
    const { database, storeId, deviceId, cashier, product, cloud, engine, otherEngine, other } =
      await setup();
    await openShift(database, {
      storeId,
      deviceId,
      userId: cashier.id,
      openingCash: 0,
      now: '2026-10-09T02:00:00.000Z',
    });
    for (const name of ['Espresso', 'Americano', 'Teh Tarik']) {
      await completeSale(database, {
        storeId,
        deviceId,
        cashier: { id: cashier.id, role: 'cashier' },
        cart: cartReducer(EMPTY_CART, { type: 'add', productId: product(name).id }),
        paymentMethod: 'cash',
        amountPaid: 50_000,
        now: '2026-10-09T03:00:00.000Z',
      });
    }
    await engine.syncOnce();
    // Forget that it was sent, as if the reply had been lost.
    await database.transactions.toCollection().modify({ pending: 1 });
    await engine.syncOnce();
    await otherEngine.syncOnce();
    await otherEngine.syncOnce();

    expect(cloud.rows('transactions')).toHaveLength(3);
    expect(await other.transactions.count()).toBe(3);
    expect(await other.transactionItems.count()).toBe(3);
  });

  it('uploads image files and downloads them on the other device', async () => {
    const { database, storeId, cloud, engine, other, otherEngine } = await setup();
    const imageId = await saveImage(
      database,
      storeId,
      new Blob(['logo'], { type: 'image/jpeg' }),
      '2026-10-09T03:00:00.000Z',
    );
    await engine.syncOnce();
    expect(cloud.files.has(`${storeId}/${imageId}`)).toBe(true);
    expect(cloud.rows('images')[0]).not.toHaveProperty('blob');

    await otherEngine.syncOnce();
    const image = await other.images.get(imageId);
    // (jsdom's Blob loses its methods inside fake-indexeddb; the real file check is in sync.cloud.test.ts.)
    expect(image?.blob).toBeTruthy();
    expect(image?.pending).toBeUndefined();
  });

  it('looks back a little on each pull to catch rows that became visible late', async () => {
    const { engine, other, otherEngine, cloud } = await setup();
    await engine.syncOnce();
    await otherEngine.pull();

    // A row that committed late, stamped before the newest row the device has seen.
    const seen = cloud.rows('categories')[0]!;
    const late = { ...seen, id: crypto.randomUUID(), name: 'Telat' };
    const lateStamp = new Date(Date.parse(String(seen.synced_at)) - 30_000);
    cloud.tables.get('categories')!.set(String(late.id), {
      ...late,
      synced_at: lateStamp.toISOString(),
    });
    await otherEngine.pull();
    expect((await other.categories.toArray()).map((c) => c.name)).toContain('Telat');
  });
});

async function countAll(database: PosDatabase) {
  let n = 0;
  for (const table of database.tables) {
    if (table.name !== 'meta' && table.name !== 'counters') n += await table.count();
  }
  return n;
}
