import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Product } from '../../db/schema';
import { loadStockLevels } from '../../db/stock';
import { stockStatus, type StockStatus } from '../../domain/stock';

export interface StockRow {
  product: Product;
  onHand: number;
  status: StockStatus;
}

/** Chip colors; the text (Habis / Sisa 3 / Stok 12) always says the status too. */
export const STOCK_TONE: Record<StockStatus, string> = {
  out: 'bg-red-100 text-red-900',
  low: 'bg-amber-100 text-amber-900',
  ok: 'bg-slate-100 text-slate-700',
};

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  out: 'Habis',
  low: 'Menipis',
  ok: 'Aman',
};

const STATUS_ORDER: Record<StockStatus, number> = { out: 0, low: 1, ok: 2 };

/** Stock on hand per product id, for products that track stock. undefined while loading. */
export function useStockLevels(storeId: string): Map<string, number> | undefined {
  return useLiveQuery(() => loadStockLevels(db, storeId), [storeId]);
}

/** Active products that track stock, empty or low ones first. */
export function useStockRows(storeId: string): StockRow[] | undefined {
  return useLiveQuery(async () => {
    const [levels, products] = await Promise.all([
      loadStockLevels(db, storeId),
      db.products
        .where({ storeId })
        .filter((p) => p.trackStock && p.active && !p.deletedAt)
        .toArray(),
    ]);
    return products
      .map((product) => {
        const onHand = levels.get(product.id) ?? 0;
        return { product, onHand, status: stockStatus(onHand, product.lowStockThreshold) };
      })
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.product.name.localeCompare(b.product.name, 'id'),
      );
  }, [storeId]);
}

/** For the menu: whether any product tracks stock, and how many are low or empty. */
export function useStockAlerts(storeId: string): { tracked: number; alerts: number } | undefined {
  const rows = useStockRows(storeId);
  if (!rows) return undefined;
  return { tracked: rows.length, alerts: rows.filter((r) => r.status !== 'ok').length };
}
