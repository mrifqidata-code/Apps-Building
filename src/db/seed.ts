import { uuidv7 } from '../domain/id';
import type { Rupiah } from '../domain/money';
import { nowIso, type IsoDateTime } from '../domain/time';
import type { PosDatabase } from './db';
import type {
  Category,
  Device,
  Product,
  ProductVariant,
  Store,
  SyncedRow,
  User,
  VariantGroup,
} from './schema';

export const META_STORE_ID = 'storeId';
export const META_DEVICE_ID = 'deviceId';
export const META_IS_DEMO = 'isDemo';

interface DemoProduct {
  name: string;
  price: Rupiah;
  cost: Rupiah;
  trackStock?: boolean;
  withVariants?: boolean;
}

const DEMO_CATALOG: { category: string; products: DemoProduct[] }[] = [
  {
    category: 'Kopi',
    products: [
      { name: 'Espresso', price: 15_000, cost: 5_000 },
      { name: 'Americano', price: 18_000, cost: 6_000 },
      { name: 'Kopi Susu Gula Aren', price: 22_000, cost: 8_000, withVariants: true },
      { name: 'Cappuccino', price: 25_000, cost: 9_000 },
      { name: 'Caffè Latte', price: 25_000, cost: 9_000, withVariants: true },
      { name: 'Kopi Tubruk', price: 12_000, cost: 3_500 },
    ],
  },
  {
    category: 'Non-Kopi',
    products: [
      { name: 'Matcha Latte', price: 26_000, cost: 10_000, withVariants: true },
      { name: 'Cokelat', price: 24_000, cost: 9_000 },
      { name: 'Teh Tarik', price: 18_000, cost: 5_000 },
      { name: 'Es Teh Manis', price: 8_000, cost: 2_000 },
      { name: 'Lemon Tea', price: 15_000, cost: 4_500 },
    ],
  },
  {
    category: 'Makanan',
    products: [
      { name: 'Roti Bakar Cokelat Keju', price: 20_000, cost: 8_000 },
      { name: 'Pisang Goreng', price: 15_000, cost: 5_000 },
      { name: 'Kentang Goreng', price: 18_000, cost: 7_000 },
      { name: 'Croissant Butter', price: 22_000, cost: 11_000, trackStock: true },
    ],
  },
];

/**
 * Fills an empty database with a demo coffee shop (15 products, 3 categories)
 * so a fresh install is usable right away. Does nothing if a store already
 * exists. Returns the active store id.
 */
export async function seedDemoData(
  database: PosDatabase,
  now: IsoDateTime = nowIso(),
): Promise<string> {
  return database.transaction('rw', database.tables, async () => {
    const existing = await database.meta.get(META_STORE_ID);
    if (existing) return existing.value as string;

    const storeId = uuidv7();
    const base = (): SyncedRow => ({
      id: uuidv7(),
      storeId,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
      deletedAt: null,
      pending: 1,
    });

    const store: Store = {
      ...base(),
      id: storeId,
      name: 'Kedai Kopi Senja (Demo)',
      address: 'Jl. Contoh No. 1, Jakarta',
      phone: '',
      logoImageId: null,
      receiptFooter: 'Terima kasih, sampai jumpa lagi!',
      pricesIncludeTax: false,
      pb1Bps: 0,
      serviceBps: 0,
      qrisImageId: null,
      cashierMaxDiscountBps: 0,
    };

    const users: User[] = [
      {
        ...base(),
        name: 'Pemilik',
        role: 'owner',
        email: null,
        authUserId: null,
        pinHash: null,
        pinSalt: null,
        active: true,
      },
      {
        ...base(),
        name: 'Kasir',
        role: 'cashier',
        email: null,
        authUserId: null,
        pinHash: null,
        pinSalt: null,
        active: true,
      },
    ];

    const device: Device = {
      ...base(),
      name: 'Kasir 1',
      code: 'K1',
      active: true,
      lastSeenAt: null,
    };

    const categories: Category[] = [];
    const products: Product[] = [];
    const groups: VariantGroup[] = [];
    const variants: ProductVariant[] = [];

    DEMO_CATALOG.forEach((entry, categoryIndex) => {
      const category: Category = {
        ...base(),
        name: entry.category,
        sortOrder: categoryIndex,
        active: true,
      };
      categories.push(category);

      entry.products.forEach((demo, productIndex) => {
        const product: Product = {
          ...base(),
          categoryId: category.id,
          name: demo.name,
          price: demo.price,
          cost: demo.cost,
          imageId: null,
          active: true,
          trackStock: demo.trackStock ?? false,
          lowStockThreshold: demo.trackStock ? 5 : null,
          sortOrder: productIndex,
        };
        products.push(product);
        if (!demo.withVariants) return;

        const size: VariantGroup = {
          ...base(),
          productId: product.id,
          name: 'Ukuran',
          mode: 'single',
          required: true,
          sortOrder: 0,
        };
        const extras: VariantGroup = {
          ...base(),
          productId: product.id,
          name: 'Tambahan',
          mode: 'multi',
          required: false,
          sortOrder: 1,
        };
        groups.push(size, extras);
        const variant = (
          group: VariantGroup,
          name: string,
          priceDelta: Rupiah,
          costDelta: Rupiah,
          sortOrder: number,
        ): ProductVariant => ({
          ...base(),
          productId: product.id,
          groupId: group.id,
          name,
          priceDelta,
          costDelta,
          sortOrder,
          active: true,
        });
        variants.push(
          variant(size, 'Reguler', 0, 0, 0),
          variant(size, 'Large', 5_000, 2_000, 1),
          variant(extras, 'Extra Shot', 5_000, 2_000, 0),
          variant(extras, 'Oat Milk', 6_000, 3_000, 1),
        );
      });
    });

    await database.stores.add(store);
    await database.users.bulkAdd(users);
    await database.devices.add(device);
    await database.categories.bulkAdd(categories);
    await database.products.bulkAdd(products);
    await database.variantGroups.bulkAdd(groups);
    await database.productVariants.bulkAdd(variants);
    await database.meta.bulkPut([
      { key: META_STORE_ID, value: storeId },
      { key: META_DEVICE_ID, value: device.id },
      { key: META_IS_DEMO, value: true },
    ]);
    return storeId;
  });
}
