import { afterEach, describe, expect, it } from 'vitest';
import {
  ValidationError,
  deleteCategory,
  deleteProduct,
  saveCategory,
  saveProduct,
  updateStoreSettings,
  type ProductInput,
} from './catalog-admin';
import { demoDatabase } from '../test/db';

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

const T1 = '2026-10-08T03:00:00.000Z';
const T2 = '2026-10-08T04:00:00.000Z';

async function setup() {
  const demo = await demoDatabase();
  cleanup = () => demo.database.delete();
  const actor = { userId: demo.owner.id, deviceId: demo.deviceId };
  return { ...demo, actor };
}

const basic = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  categoryId: null,
  name: 'Es Kopi Susu',
  price: 18_000,
  cost: 6_000,
  imageId: null,
  active: true,
  groups: [],
  ...overrides,
});

describe('saveProduct', () => {
  it('creates a product with variant groups', async () => {
    const { database, storeId, actor } = await setup();
    const id = await saveProduct(
      database,
      storeId,
      basic({
        name: '  Es   Kopi Susu ',
        groups: [
          {
            name: 'Ukuran',
            mode: 'single',
            required: true,
            options: [
              { name: 'Reguler', priceDelta: 0, costDelta: 0 },
              { name: 'Jumbo', priceDelta: 6_000, costDelta: 2_500 },
            ],
          },
        ],
      }),
      actor,
      T1,
    );

    const product = await database.products.get(id);
    expect(product).toMatchObject({
      name: 'Es Kopi Susu',
      price: 18_000,
      cost: 6_000,
      syncedAt: null,
    });
    const options = await database.productVariants.where({ productId: id }).sortBy('sortOrder');
    expect(options.map((o) => [o.name, o.priceDelta])).toEqual([
      ['Reguler', 0],
      ['Jumbo', 6_000],
    ]);
  });

  it('logs price and HPP changes in the audit log', async () => {
    const { database, storeId, actor } = await setup();
    const id = await saveProduct(database, storeId, basic(), actor, T1);
    await saveProduct(database, storeId, basic({ id, price: 20_000, cost: 7_000 }), actor, T2);

    const audit = await database.auditLog.where({ entityId: id }).toArray();
    expect(audit.map((a) => [a.action, a.before, a.after, a.actorId])).toEqual([
      ['price_change', { price: 18_000 }, { price: 20_000 }, actor.userId],
      ['cost_change', { cost: 6_000 }, { cost: 7_000 }, actor.userId],
    ]);
    expect((await database.products.get(id))?.updatedAt).toBe(T2);
  });

  it('does not log anything when price and HPP stay the same', async () => {
    const { database, storeId, actor } = await setup();
    const id = await saveProduct(database, storeId, basic(), actor, T1);
    await saveProduct(database, storeId, basic({ id, name: 'Es Kopi' }), actor, T2);
    expect(await database.auditLog.count()).toBe(0);
  });

  it('updates kept variants and soft-deletes removed ones', async () => {
    const { database, storeId, actor } = await setup();
    const id = await saveProduct(
      database,
      storeId,
      basic({
        groups: [
          {
            name: 'Topping',
            mode: 'multi',
            required: false,
            options: [
              { name: 'Boba', priceDelta: 4_000, costDelta: 1_000 },
              { name: 'Jelly', priceDelta: 3_000, costDelta: 800 },
            ],
          },
        ],
      }),
      actor,
      T1,
    );
    const [group] = await database.variantGroups.where({ productId: id }).toArray();
    const boba = (await database.productVariants.where({ productId: id }).toArray()).find(
      (o) => o.name === 'Boba',
    )!;

    await saveProduct(
      database,
      storeId,
      basic({
        id,
        groups: [
          {
            id: group!.id,
            name: 'Topping',
            mode: 'multi',
            required: false,
            options: [{ id: boba.id, name: 'Boba', priceDelta: 5_000, costDelta: 1_000 }],
          },
        ],
      }),
      actor,
      T2,
    );

    const options = await database.productVariants.where({ productId: id }).toArray();
    expect(options.find((o) => o.id === boba.id)).toMatchObject({
      priceDelta: 5_000,
      deletedAt: null,
    });
    expect(options.find((o) => o.name === 'Jelly')).toMatchObject({
      deletedAt: T2,
      syncedAt: null,
    });
  });

  it('validates names, money and empty variant groups', async () => {
    const { database, storeId, actor } = await setup();
    const save = (input: ProductInput) => saveProduct(database, storeId, input, actor, T1);
    await expect(save(basic({ name: '   ' }))).rejects.toThrow('Nama produk wajib diisi.');
    await expect(save(basic({ price: 1_000.5 }))).rejects.toThrow(ValidationError);
    await expect(save(basic({ cost: -1 }))).rejects.toThrow('HPP tidak boleh minus.');
    await expect(
      save(basic({ groups: [{ name: 'Ukuran', mode: 'single', required: true, options: [] }] })),
    ).rejects.toThrow('Varian "Ukuran" belum punya pilihan.');
  });

  it('soft-deletes products', async () => {
    const { database, storeId, actor } = await setup();
    const id = await saveProduct(database, storeId, basic(), actor, T1);
    await deleteProduct(database, id, T2);
    expect(await database.products.get(id)).toMatchObject({ deletedAt: T2, active: false });
  });
});

describe('categories', () => {
  it('creates, renames and refuses duplicates', async () => {
    const { database, storeId } = await setup();
    const id = await saveCategory(database, storeId, { name: 'Frozen Food' }, T1);
    await expect(saveCategory(database, storeId, { name: 'frozen food' }, T1)).rejects.toThrow(
      'Kategori "frozen food" sudah ada.',
    );
    await saveCategory(database, storeId, { id, name: 'Frozen' }, T2);
    expect(await database.categories.get(id)).toMatchObject({ name: 'Frozen', sortOrder: 3 });
  });

  it('only deletes empty categories', async () => {
    const { database, storeId, product } = await setup();
    const kopi = product('Espresso').categoryId!;
    await expect(deleteCategory(database, kopi, T1)).rejects.toThrow(
      'Kategori masih berisi produk.',
    );
    const empty = await saveCategory(database, storeId, { name: 'Kosong' }, T1);
    await deleteCategory(database, empty, T2);
    expect((await database.categories.get(empty))?.deletedAt).toBe(T2);
  });
});

describe('updateStoreSettings', () => {
  it('saves only changed fields and audits them', async () => {
    const { database, storeId, actor } = await setup();
    await updateStoreSettings(
      database,
      storeId,
      { qrisImageId: 'img-1', name: 'Kedai Kopi Senja (Demo)' },
      actor,
      T1,
    );
    expect((await database.stores.get(storeId))?.qrisImageId).toBe('img-1');
    const [entry] = await database.auditLog.toArray();
    expect(entry).toMatchObject({
      action: 'settings_change',
      before: { qrisImageId: null },
      after: { qrisImageId: 'img-1' },
    });

    await updateStoreSettings(database, storeId, { qrisImageId: 'img-1' }, actor, T2);
    expect(await database.auditLog.count()).toBe(1);
  });

  it('rejects invalid percentages and an empty store name', async () => {
    const { database, storeId, actor } = await setup();
    await expect(
      updateStoreSettings(database, storeId, { pb1Bps: 10_001 }, actor, T1),
    ).rejects.toThrow('Persen harus antara 0 dan 100.');
    await expect(
      updateStoreSettings(database, storeId, { serviceBps: 2.5 }, actor, T1),
    ).rejects.toThrow(ValidationError);
    await expect(updateStoreSettings(database, storeId, { name: '  ' }, actor, T1)).rejects.toThrow(
      'Nama toko wajib diisi.',
    );
    expect(await database.auditLog.count()).toBe(0);
  });
});
