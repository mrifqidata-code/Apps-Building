import { allocateProportionally, type Rupiah } from './money';
import { jakartaDateKey, jakartaParts, type IsoDateTime } from './time';

/**
 * Sales reports, computed from the stored transactions and their item
 * snapshots (so editing a price or HPP later never changes a past report).
 *
 * Definitions (agreed with the owner):
 * - Penjualan kotor: unit price x qty, before any discount.
 * - Diskon: item discounts plus transaction discounts.
 * - Penjualan bersih: what the store earns from the goods, without PB1 and
 *   the service charge: total - service - PB1. This holds for both price
 *   modes; with "harga sudah termasuk pajak" PB1 and service are taken out
 *   of the price.
 * - HPP: unit cost x qty (snapshot at sale time).
 * - Laba kotor: penjualan bersih - HPP.
 * - Only paid transactions count. Voided and refunded ones are listed
 *   separately and left out of every figure.
 *
 * A transaction's penjualan bersih is spread over its items in proportion
 * to each item's total after item discounts, so per-product figures add up
 * exactly to the transaction (and include the transaction discount).
 */

export type ReportPaymentMethod = 'cash' | 'qris' | 'transfer';
export const PAYMENT_METHODS: readonly ReportPaymentMethod[] = ['cash', 'qris', 'transfer'];

export interface ReportTransaction {
  id: string;
  createdAt: IsoDateTime;
  status: 'paid' | 'void' | 'refunded';
  paymentMethod: ReportPaymentMethod;
  /** Transaction-level discount (item discounts are on the items). */
  discountAmount: Rupiah;
  pricesIncludeTax: boolean;
  serviceAmount: Rupiah;
  taxAmount: Rupiah;
  total: Rupiah;
}

export interface ReportItem {
  id: string;
  transactionId: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: Rupiah;
  unitCost: Rupiah;
  /** After the item discount, before the transaction discount. */
  lineTotal: Rupiah;
}

interface ProfitFigures {
  grossSales: Rupiah;
  netSales: Rupiah;
  cost: Rupiah;
  grossProfit: Rupiah;
}

export interface Figures extends ProfitFigures {
  /** Item discounts plus transaction discounts. */
  discount: Rupiah;
}

export interface ItemFigures extends ProfitFigures {
  /** Only the item's own discount; its share of the transaction discount is inside netSales. */
  itemDiscount: Rupiah;
}

export interface TransactionFigures extends Figures {
  serviceAmount: Rupiah;
  taxAmount: Rupiah;
  total: Rupiah;
  /** Per item id. */
  items: Map<string, ItemFigures>;
}

/** Penjualan bersih of one transaction: what is left after PB1 and service. */
export const netSalesOf = (t: Pick<ReportTransaction, 'total' | 'serviceAmount' | 'taxAmount'>) =>
  t.total - t.serviceAmount - t.taxAmount;

/** Figures of one transaction and each of its items. */
export function transactionFigures(t: ReportTransaction, items: ReportItem[]): TransactionFigures {
  const netSales = netSalesOf(t);
  // Items can arrive from another device a moment after their transaction.
  const shares = items.length
    ? allocateProportionally(
        Math.max(netSales, 0),
        items.map((i) => i.lineTotal),
      )
    : [];
  const perItem = new Map<string, ItemFigures>();
  let grossSales = 0;
  let itemDiscounts = 0;
  let cost = 0;
  items.forEach((item, i) => {
    const gross = item.unitPrice * item.qty;
    const itemCost = item.unitCost * item.qty;
    const net = shares[i]!;
    perItem.set(item.id, {
      grossSales: gross,
      itemDiscount: gross - item.lineTotal,
      netSales: net,
      cost: itemCost,
      grossProfit: net - itemCost,
    });
    grossSales += gross;
    itemDiscounts += gross - item.lineTotal;
    cost += itemCost;
  });
  return {
    grossSales,
    discount: itemDiscounts + t.discountAmount,
    netSales,
    cost,
    grossProfit: netSales - cost,
    serviceAmount: t.serviceAmount,
    taxAmount: t.taxAmount,
    total: t.total,
    items: perItem,
  };
}

export interface SalesTotals extends Figures {
  transactions: number;
  itemQty: number;
  serviceAmount: Rupiah;
  taxAmount: Rupiah;
  /** What customers paid: penjualan bersih + service + PB1. */
  totalReceived: Rupiah;
}

export interface ProductRow extends ProfitFigures {
  productId: string;
  /** Name at the most recent sale in the period. */
  name: string;
  qty: number;
}

export interface MethodRow {
  method: ReportPaymentMethod;
  transactions: number;
  totalReceived: Rupiah;
}

export interface HourRow {
  /** 0–23, WIB. */
  hour: number;
  transactions: number;
  totalReceived: Rupiah;
}

export interface DayRow {
  /** WIB date key, e.g. "2026-10-10". */
  date: string;
  transactions: number;
  totalReceived: Rupiah;
  netSales: Rupiah;
  grossProfit: Rupiah;
}

export interface SalesReport {
  totals: SalesTotals;
  byMethod: MethodRow[];
  /** Best sellers first (penjualan bersih, then qty). */
  byProduct: ProductRow[];
  /** All 24 hours of the day, summed over every day in the report. */
  byHour: HourRow[];
  /** One row per requested day, including days without sales. */
  byDay: DayRow[];
  /** Voided or refunded: not counted anywhere above. */
  cancelled: { transactions: number; total: Rupiah };
  /** True when some sales had PB1/service inside the price. */
  includesTaxInPrices: boolean;
  /** Paid transactions whose items have not arrived from another device yet (HPP unknown). */
  missingItems: number;
}

const emptyTotals = (): SalesTotals => ({
  transactions: 0,
  itemQty: 0,
  grossSales: 0,
  discount: 0,
  netSales: 0,
  cost: 0,
  grossProfit: 0,
  serviceAmount: 0,
  taxAmount: 0,
  totalReceived: 0,
});

/**
 * Builds the report for the given transactions (already limited to the
 * period) and their items. `days` lists the period's days for byDay.
 */
export function buildSalesReport(
  transactions: ReportTransaction[],
  items: ReportItem[],
  days: string[] = [],
): SalesReport {
  const itemsByTransaction = new Map<string, ReportItem[]>();
  for (const item of items) {
    const list = itemsByTransaction.get(item.transactionId);
    if (list) list.push(item);
    else itemsByTransaction.set(item.transactionId, [item]);
  }

  const totals = emptyTotals();
  const byMethod = new Map<ReportPaymentMethod, MethodRow>(
    PAYMENT_METHODS.map((method) => [method, { method, transactions: 0, totalReceived: 0 }]),
  );
  const byHour: HourRow[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    transactions: 0,
    totalReceived: 0,
  }));
  const byDay = new Map<string, DayRow>(
    days.map((date) => [
      date,
      { date, transactions: 0, totalReceived: 0, netSales: 0, grossProfit: 0 },
    ]),
  );
  const byProduct = new Map<string, ProductRow>();
  const lastSold = new Map<string, string>();
  const cancelled = { transactions: 0, total: 0 };
  let includesTaxInPrices = false;
  let missingItems = 0;

  for (const t of transactions) {
    if (t.status !== 'paid') {
      cancelled.transactions++;
      cancelled.total += t.total;
      continue;
    }
    const lines = itemsByTransaction.get(t.id) ?? [];
    if (lines.length === 0) missingItems++;
    const f = transactionFigures(t, lines);
    if (t.pricesIncludeTax && t.serviceAmount + t.taxAmount > 0) includesTaxInPrices = true;

    totals.transactions++;
    totals.grossSales += f.grossSales;
    totals.discount += f.discount;
    totals.netSales += f.netSales;
    totals.cost += f.cost;
    totals.grossProfit += f.grossProfit;
    totals.serviceAmount += f.serviceAmount;
    totals.taxAmount += f.taxAmount;
    totals.totalReceived += f.total;

    const method = byMethod.get(t.paymentMethod);
    if (method) {
      method.transactions++;
      method.totalReceived += t.total;
    }

    const hour = byHour[jakartaParts(t.createdAt).hour]!;
    hour.transactions++;
    hour.totalReceived += t.total;

    const date = jakartaDateKey(t.createdAt);
    let day = byDay.get(date);
    if (!day) {
      day = { date, transactions: 0, totalReceived: 0, netSales: 0, grossProfit: 0 };
      byDay.set(date, day);
    }
    day.transactions++;
    day.totalReceived += t.total;
    day.netSales += f.netSales;
    day.grossProfit += f.grossProfit;

    for (const item of lines) {
      const itemFigures = f.items.get(item.id)!;
      totals.itemQty += item.qty;
      let row = byProduct.get(item.productId);
      if (!row) {
        row = {
          productId: item.productId,
          name: item.productName,
          qty: 0,
          grossSales: 0,
          netSales: 0,
          cost: 0,
          grossProfit: 0,
        };
        byProduct.set(item.productId, row);
        lastSold.set(item.productId, t.createdAt);
      } else if (t.createdAt > lastSold.get(item.productId)!) {
        row.name = item.productName;
        lastSold.set(item.productId, t.createdAt);
      }
      row.qty += item.qty;
      row.grossSales += itemFigures.grossSales;
      row.netSales += itemFigures.netSales;
      row.cost += itemFigures.cost;
      row.grossProfit += itemFigures.grossProfit;
    }
  }

  const products = [...byProduct.values()].sort(
    (a, b) => b.netSales - a.netSales || b.qty - a.qty || a.name.localeCompare(b.name, 'id'),
  );

  return {
    totals,
    byMethod: [...byMethod.values()],
    byProduct: products,
    byHour,
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    cancelled,
    includesTaxInPrices,
    missingItems,
  };
}

/** The busiest hour (most transactions, then most money, then earliest); null without sales. */
export function busiestHour(byHour: HourRow[]): HourRow | null {
  let best: HourRow | null = null;
  for (const row of byHour) {
    if (row.transactions === 0) continue;
    if (
      !best ||
      row.transactions > best.transactions ||
      (row.transactions === best.transactions && row.totalReceived > best.totalReceived)
    ) {
      best = row;
    }
  }
  return best;
}

/** "12.00–13.00" */
export function formatHourRange(hour: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hour)}.00–${pad((hour + 1) % 24)}.00`;
}
