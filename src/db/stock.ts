import { assertQuantity, stockByProduct, stockOnHand } from '../domain/stock';
import type { IsoDateTime } from '../domain/time';
import type { PosDatabase } from './db';
import { newRow } from './rows';
import type { AuditLogEntry, Product, StockMovement, UserRole } from './schema';

/**
 * Stok masuk and stok opname. Sales take stock out in completeSale. Only
 * products with trackStock have stock; see src/domain/stock.ts for how the
 * number is computed.
 */

export class StockError extends Error {}

export const MAX_STOCK_NOTE_LENGTH = 80;

function cleanNote(note: string): string | null {
  const trimmed = note.trim();
  if (trimmed.length > MAX_STOCK_NOTE_LENGTH) {
    throw new StockError(`Catatan maksimal ${MAX_STOCK_NOTE_LENGTH} karakter.`);
  }
  return trimmed || null;
}

function quantity(qty: number, label: string, allowZero: boolean): number {
  try {
    return assertQuantity(qty, label, { allowZero });
  } catch {
    throw new StockError(
      allowZero
        ? `${label} harus angka bulat, mulai dari 0.`
        : `${label} harus angka bulat lebih dari 0.`,
    );
  }
}

const liveMovements = (database: PosDatabase, productIds: string[]) =>
  database.stockMovements
    .where('productId')
    .anyOf(productIds)
    .filter((m) => m.deletedAt === null)
    .toArray();

/** Stock on hand of every product that tracks stock in the store. */
export async function loadStockLevels(
  database: PosDatabase,
  storeId: string,
): Promise<Map<string, number>> {
  const tracked = await database.products
    .where({ storeId })
    .filter((p) => p.trackStock && !p.deletedAt)
    .primaryKeys();
  const levels = stockByProduct(await liveMovements(database, tracked));
  return new Map(tracked.map((id) => [id, levels.get(id) ?? 0]));
}

export async function loadProductStock(database: PosDatabase, productId: string): Promise<number> {
  return stockOnHand(await liveMovements(database, [productId]));
}

async function trackedProduct(database: PosDatabase, storeId: string, productId: string) {
  const product = await database.products.get(productId);
  if (!product || product.storeId !== storeId || product.deletedAt) {
    throw new StockError('Produk tidak ditemukan.');
  }
  if (!product.trackStock) throw new StockError(`Stok ${product.name} tidak dilacak.`);
  return product;
}

export interface StockInInput {
  storeId: string;
  productId: string;
  qty: number;
  note: string;
  userId: string;
  now: IsoDateTime;
}

/** Goods arrived: adds `qty` to the stock. Cashiers may do this. */
export async function addStockIn(database: PosDatabase, input: StockInInput) {
  const qty = quantity(input.qty, 'Jumlah', false);
  const note = cleanNote(input.note);
  return database.transaction('rw', database.products, database.stockMovements, async () => {
    await trackedProduct(database, input.storeId, input.productId);
    const movement: StockMovement = {
      ...newRow(input.storeId, input.now),
      productId: input.productId,
      type: 'in',
      qtyDelta: qty,
      countedQty: null,
      transactionId: null,
      note,
      userId: input.userId,
    };
    await database.stockMovements.add(movement);
    return movement;
  });
}

export interface OpnameInput {
  storeId: string;
  productId: string;
  countedQty: number;
  note: string;
  actor: { userId: string; deviceId: string; role: UserRole };
  now: IsoDateTime;
}

/**
 * Stok opname: the counted quantity becomes the new stock. Owner only, and
 * logged in the audit log with the stock before and after.
 */
export async function recordStockOpname(database: PosDatabase, input: OpnameInput) {
  if (input.actor.role !== 'owner') {
    throw new StockError('Stok opname hanya bisa dilakukan pemilik.');
  }
  return writeOpname(database, input);
}

/** The opname itself; also used when the owner turns on stock tracking with a starting count. */
export async function writeOpname(
  database: PosDatabase,
  input: Omit<OpnameInput, 'actor'> & { actor: { userId: string; deviceId: string } },
): Promise<StockMovement> {
  const counted = quantity(input.countedQty, 'Hasil hitung', true);
  const note = cleanNote(input.note);
  return database.transaction(
    'rw',
    [database.products, database.stockMovements, database.auditLog],
    async () => {
      const product: Product = await trackedProduct(database, input.storeId, input.productId);
      const before = await loadProductStock(database, product.id);
      const movement: StockMovement = {
        ...newRow(input.storeId, input.now),
        productId: product.id,
        type: 'opname',
        // The difference as this phone saw it, for the history ("hilang 2").
        qtyDelta: counted - before,
        countedQty: counted,
        transactionId: null,
        note,
        userId: input.actor.userId,
      };
      const audit: AuditLogEntry = {
        ...newRow(input.storeId, input.now),
        actorId: input.actor.userId,
        deviceId: input.actor.deviceId,
        action: 'stock_opname',
        entity: 'product',
        entityId: product.id,
        before: { stock: before },
        after: { stock: counted },
        reason: note,
      };
      await database.stockMovements.add(movement);
      await database.auditLog.add(audit);
      return movement;
    },
  );
}
