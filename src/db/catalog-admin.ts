import { assertRupiah, type Rupiah } from '../domain/money';
import type { IsoDateTime } from '../domain/time';
import type { PosDatabase } from './db';
import { newRow, touched } from './rows';
import type {
  AuditAction,
  AuditLogEntry,
  Category,
  Product,
  ProductVariant,
  Store,
  VariantGroup,
  VariantGroupMode,
} from './schema';

export class ValidationError extends Error {}

export interface Actor {
  userId: string;
  deviceId: string;
}

const MAX_NAME = 60;

function cleanName(name: string, label: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new ValidationError(`${label} wajib diisi.`);
  if (trimmed.length > MAX_NAME) throw new ValidationError(`${label} maksimal ${MAX_NAME} huruf.`);
  return trimmed;
}

function cleanMoney(value: number, label: string, allowNegative = false): Rupiah {
  try {
    assertRupiah(value, label);
  } catch {
    throw new ValidationError(`${label} harus angka rupiah tanpa koma.`);
  }
  if (!allowNegative && value < 0) throw new ValidationError(`${label} tidak boleh minus.`);
  return value;
}

function auditEntry(
  storeId: string,
  actor: Actor,
  action: AuditAction,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
  now: IsoDateTime,
): AuditLogEntry {
  return {
    ...newRow(storeId, now),
    actorId: actor.userId,
    deviceId: actor.deviceId,
    action,
    entity,
    entityId,
    before,
    after,
    reason: null,
  };
}

/* ---- Categories ---- */

export async function saveCategory(
  database: PosDatabase,
  storeId: string,
  input: { id?: string; name: string },
  now: IsoDateTime,
): Promise<string> {
  const name = cleanName(input.name, 'Nama kategori');
  return database.transaction('rw', database.categories, async () => {
    const siblings = await database.categories
      .where({ storeId })
      .filter((c) => !c.deletedAt)
      .toArray();
    if (siblings.some((c) => c.id !== input.id && c.name.toLowerCase() === name.toLowerCase())) {
      throw new ValidationError(`Kategori "${name}" sudah ada.`);
    }
    if (input.id) {
      await database.categories.update(input.id, { name, ...touched(now) });
      return input.id;
    }
    const category: Category = {
      ...newRow(storeId, now),
      name,
      sortOrder: Math.max(-1, ...siblings.map((c) => c.sortOrder)) + 1,
      active: true,
    };
    await database.categories.add(category);
    return category.id;
  });
}

export async function deleteCategory(
  database: PosDatabase,
  categoryId: string,
  now: IsoDateTime,
): Promise<void> {
  await database.transaction('rw', database.categories, database.products, async () => {
    const inUse = await database.products
      .where({ categoryId })
      .filter((p) => !p.deletedAt)
      .count();
    if (inUse > 0) {
      throw new ValidationError(
        'Kategori masih berisi produk. Pindahkan atau hapus produknya dulu.',
      );
    }
    await database.categories.update(categoryId, { deletedAt: now, ...touched(now) });
  });
}

/* ---- Products and variants ---- */

export interface VariantOptionInput {
  id?: string;
  name: string;
  priceDelta: Rupiah;
  costDelta: Rupiah;
}

export interface VariantGroupInput {
  id?: string;
  name: string;
  mode: VariantGroupMode;
  required: boolean;
  options: VariantOptionInput[];
}

export interface ProductInput {
  id?: string;
  categoryId: string | null;
  name: string;
  price: Rupiah;
  cost: Rupiah;
  imageId: string | null;
  active: boolean;
  groups: VariantGroupInput[];
}

/**
 * Creates or updates a product with its variant groups. Groups and options
 * missing from the input are soft-deleted. Price and HPP changes go to the
 * audit log.
 */
export async function saveProduct(
  database: PosDatabase,
  storeId: string,
  input: ProductInput,
  actor: Actor,
  now: IsoDateTime,
): Promise<string> {
  const name = cleanName(input.name, 'Nama produk');
  const price = cleanMoney(input.price, 'Harga jual');
  const cost = cleanMoney(input.cost, 'HPP');
  const groups = input.groups.map((g) => {
    const options = g.options.map((o) => ({
      ...o,
      name: cleanName(o.name, `Nama pilihan di ${g.name || 'varian'}`),
      priceDelta: cleanMoney(o.priceDelta, 'Tambahan harga', true),
      costDelta: cleanMoney(o.costDelta, 'Tambahan HPP', true),
    }));
    if (options.length === 0) throw new ValidationError(`Varian "${g.name}" belum punya pilihan.`);
    return { ...g, name: cleanName(g.name, 'Nama varian'), options };
  });

  return database.transaction(
    'rw',
    [database.products, database.variantGroups, database.productVariants, database.auditLog],
    async () => {
      let productId = input.id;
      if (productId) {
        const existing = await database.products.get(productId);
        if (!existing || existing.storeId !== storeId)
          throw new ValidationError('Produk tidak ditemukan.');
        await database.products.update(productId, {
          categoryId: input.categoryId,
          name,
          price,
          cost,
          imageId: input.imageId,
          active: input.active,
          ...touched(now),
        });
        const audits: AuditLogEntry[] = [];
        if (existing.price !== price) {
          audits.push(
            auditEntry(
              storeId,
              actor,
              'price_change',
              'product',
              productId,
              { price: existing.price },
              { price },
              now,
            ),
          );
        }
        if (existing.cost !== cost) {
          audits.push(
            auditEntry(
              storeId,
              actor,
              'cost_change',
              'product',
              productId,
              { cost: existing.cost },
              { cost },
              now,
            ),
          );
        }
        if (audits.length) await database.auditLog.bulkAdd(audits);
      } else {
        const inCategory = await database.products
          .where({ storeId })
          .filter((p) => p.categoryId === input.categoryId && !p.deletedAt)
          .toArray();
        const product: Product = {
          ...newRow(storeId, now),
          categoryId: input.categoryId,
          name,
          price,
          cost,
          imageId: input.imageId,
          active: input.active,
          trackStock: false,
          lowStockThreshold: null,
          sortOrder: Math.max(-1, ...inCategory.map((p) => p.sortOrder)) + 1,
        };
        await database.products.add(product);
        productId = product.id;
      }

      await syncVariants(database, storeId, productId, groups, now);
      return productId;
    },
  );
}

async function syncVariants(
  database: PosDatabase,
  storeId: string,
  productId: string,
  groups: VariantGroupInput[],
  now: IsoDateTime,
) {
  const existingGroups = await database.variantGroups
    .where({ productId })
    .filter((g) => !g.deletedAt)
    .toArray();
  const existingOptions = await database.productVariants
    .where({ productId })
    .filter((v) => !v.deletedAt)
    .toArray();
  const keptGroupIds = new Set<string>();
  const keptOptionIds = new Set<string>();

  for (const [groupIndex, g] of groups.entries()) {
    let groupId = g.id && existingGroups.some((e) => e.id === g.id) ? g.id : undefined;
    const groupFields = { name: g.name, mode: g.mode, required: g.required, sortOrder: groupIndex };
    if (groupId) {
      await database.variantGroups.update(groupId, { ...groupFields, ...touched(now) });
    } else {
      const group: VariantGroup = { ...newRow(storeId, now), productId, ...groupFields };
      await database.variantGroups.add(group);
      groupId = group.id;
    }
    keptGroupIds.add(groupId);

    for (const [optionIndex, o] of g.options.entries()) {
      const optionFields = {
        groupId,
        name: o.name,
        priceDelta: o.priceDelta,
        costDelta: o.costDelta,
        sortOrder: optionIndex,
        active: true,
      };
      if (o.id && existingOptions.some((e) => e.id === o.id)) {
        await database.productVariants.update(o.id, { ...optionFields, ...touched(now) });
        keptOptionIds.add(o.id);
      } else {
        const option: ProductVariant = { ...newRow(storeId, now), productId, ...optionFields };
        await database.productVariants.add(option);
        keptOptionIds.add(option.id);
      }
    }
  }

  const removed = { deletedAt: now, ...touched(now) };
  for (const g of existingGroups) {
    if (!keptGroupIds.has(g.id)) await database.variantGroups.update(g.id, removed);
  }
  for (const o of existingOptions) {
    if (!keptOptionIds.has(o.id)) await database.productVariants.update(o.id, removed);
  }
}

/** Soft delete: past receipts keep their snapshots, the product disappears from the catalog. */
export async function deleteProduct(
  database: PosDatabase,
  productId: string,
  now: IsoDateTime,
): Promise<void> {
  await database.products.update(productId, { deletedAt: now, active: false, ...touched(now) });
}

/* ---- Store settings ---- */

export type StoreSettingsPatch = Partial<
  Pick<
    Store,
    | 'name'
    | 'address'
    | 'phone'
    | 'logoImageId'
    | 'receiptFooter'
    | 'pricesIncludeTax'
    | 'pb1Bps'
    | 'serviceBps'
    | 'qrisImageId'
    | 'cashierMaxDiscountBps'
  >
>;

/** Updates store settings and records what changed in the audit log. */
export async function updateStoreSettings(
  database: PosDatabase,
  storeId: string,
  patch: StoreSettingsPatch,
  actor: Actor,
  now: IsoDateTime,
): Promise<void> {
  for (const key of ['pb1Bps', 'serviceBps', 'cashierMaxDiscountBps'] as const) {
    const value = patch[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 10_000)) {
      throw new ValidationError('Persen harus antara 0 dan 100.');
    }
  }
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new ValidationError('Nama toko wajib diisi.');
  }
  await database.transaction('rw', database.stores, database.auditLog, async () => {
    const store = await database.stores.get(storeId);
    if (!store) throw new ValidationError('Data toko tidak ditemukan.');
    const keys = (Object.keys(patch) as (keyof StoreSettingsPatch)[]).filter(
      (key) => patch[key] !== store[key],
    );
    if (keys.length === 0) return;
    const before = Object.fromEntries(keys.map((k) => [k, store[k]]));
    const after = Object.fromEntries(keys.map((k) => [k, patch[k]]));
    await database.stores.update(storeId, { ...after, ...touched(now) });
    await database.auditLog.add(
      auditEntry(storeId, actor, 'settings_change', 'store', storeId, before, after, now),
    );
  });
}
