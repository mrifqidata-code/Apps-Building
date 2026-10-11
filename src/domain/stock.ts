import { BPS_PER_100_PERCENT, ratioBps, type Bps, type Rupiah } from './money';
import type { IsoDateTime } from './time';

/**
 * Stock per product, computed from its movements (never stored as a number,
 * so sales on several phones never overwrite each other).
 *
 * Without a stock opname, stock is the sum of every qtyDelta. A stock opname
 * is a fresh starting point: stock = the counted quantity of the latest
 * opname + every movement recorded after it. Movements from before the count
 * are already inside the counted number, including a sale from another phone
 * that only syncs later; adding them again would count them twice.
 *
 * "After" is by (createdAt, id): UUIDv7 ids follow creation order.
 */

export type StockMovementKind = 'in' | 'sale' | 'opname' | 'void_return';

export interface StockEntry {
  id: string;
  createdAt: IsoDateTime;
  type: StockMovementKind;
  qtyDelta: number;
  /** Set on opname rows: what was counted. */
  countedQty: number | null;
}

const isAfter = (a: StockEntry, b: StockEntry) =>
  a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id > b.id);

/** Stock on hand from one product's movements (any order). */
export function stockOnHand(movements: StockEntry[]): number {
  let latestOpname: StockEntry | null = null;
  for (const m of movements) {
    if (m.type === 'opname' && m.countedQty !== null) {
      if (!latestOpname || isAfter(m, latestOpname)) latestOpname = m;
    }
  }
  let total = latestOpname ? latestOpname.countedQty! : 0;
  for (const m of movements) {
    if (m === latestOpname) continue;
    if (latestOpname && !isAfter(m, latestOpname)) continue;
    total += m.qtyDelta;
  }
  return total;
}

/** Stock per product id, from movements of many products. */
export function stockByProduct(
  movements: (StockEntry & { productId: string })[],
): Map<string, number> {
  const grouped = new Map<string, StockEntry[]>();
  for (const m of movements) {
    const list = grouped.get(m.productId);
    if (list) list.push(m);
    else grouped.set(m.productId, [m]);
  }
  return new Map([...grouped].map(([productId, list]) => [productId, stockOnHand(list)]));
}

/** out: nothing left (or sold below zero). low: at or below the product's threshold. */
export type StockStatus = 'out' | 'low' | 'ok';

export function stockStatus(onHand: number, lowThreshold: number | null): StockStatus {
  if (onHand <= 0) return 'out';
  if (lowThreshold !== null && onHand <= lowThreshold) return 'low';
  return 'ok';
}

/** "Habis", "Sisa 3" or "Stok 12"; a negative stock (sold more than recorded) stays visible. */
export function formatStock(onHand: number, lowThreshold: number | null): string {
  const status = stockStatus(onHand, lowThreshold);
  if (status === 'out') return onHand < 0 ? `Habis (${onHand})` : 'Habis';
  return status === 'low' ? `Sisa ${onHand}` : `Stok ${onHand}`;
}

export const STOCK_MOVEMENT_LABELS: Record<StockMovementKind, string> = {
  in: 'Stok masuk',
  sale: 'Terjual',
  opname: 'Stok opname',
  void_return: 'Kembali (batal)',
};

/** Whole items only: stock is counted in pieces/packs. */
export function assertQuantity(qty: number, label: string, { allowZero = false } = {}): number {
  if (!Number.isSafeInteger(qty) || qty < 0 || (!allowZero && qty === 0)) {
    throw new RangeError(
      `${label} harus bilangan bulat ${allowZero ? 'mulai 0' : 'lebih dari 0'}, bukan ${qty}`,
    );
  }
  return qty;
}

/* ---- Margin ---- */

/** Below this gross margin a product gets a "margin tipis" warning (agreed: 20%). */
export const THIN_MARGIN_BPS: Bps = 2_000;

/** Gross margin of one unit, in bps of the price; null when the price is not positive. */
export function marginBps(price: Rupiah, cost: Rupiah): Bps | null {
  return ratioBps(price - cost, price);
}

/** True when the margin is under THIN_MARGIN_BPS, or when cost reaches the price. */
export function isThinMargin(price: Rupiah, cost: Rupiah): boolean {
  if (price <= 0) return cost > 0;
  return (
    BigInt(price - cost) * BigInt(BPS_PER_100_PERCENT) < BigInt(price) * BigInt(THIN_MARGIN_BPS)
  );
}
