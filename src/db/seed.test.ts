import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isRupiah } from '../domain/money';
import { PosDatabase } from './db';
import { META_DEVICE_ID, seedDemoData } from './seed';

let database: PosDatabase;

beforeEach(() => {
  database = new PosDatabase(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
});

describe('seedDemoData', () => {
  it('creates one coffee shop with 15 products in 3 categories', async () => {
    const storeId = await seedDemoData(database);

    expect(await database.stores.count()).toBe(1);
    expect(await database.categories.where({ storeId }).count()).toBe(3);
    expect(await database.products.where({ storeId }).count()).toBe(15);

    const device = await database.devices.get(
      (await database.meta.get(META_DEVICE_ID))!.value as string,
    );
    expect(device?.code).toBe('K1');
  });

  it('stores prices and costs as whole rupiah with a positive margin', async () => {
    await seedDemoData(database);
    for (const product of await database.products.toArray()) {
      expect(isRupiah(product.price)).toBe(true);
      expect(isRupiah(product.cost)).toBe(true);
      expect(product.price).toBeGreaterThan(product.cost);
    }
  });

  it('marks every row as belonging to the store and not yet synced', async () => {
    const storeId = await seedDemoData(database);
    const tables = [
      database.users,
      database.devices,
      database.categories,
      database.products,
      database.variantGroups,
      database.productVariants,
    ];
    for (const table of tables) {
      for (const row of await table.toArray()) {
        expect(row.storeId).toBe(storeId);
        expect(row.syncedAt).toBeNull();
        expect(row.deletedAt).toBeNull();
      }
    }
  });

  it('is safe to run again', async () => {
    const first = await seedDemoData(database);
    const second = await seedDemoData(database);
    expect(second).toBe(first);
    expect(await database.products.count()).toBe(15);
  });
});
