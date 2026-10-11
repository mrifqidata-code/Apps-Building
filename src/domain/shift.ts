import { formatRupiah, type Rupiah } from './money';
import { PAYMENT_LABELS } from './receipt-text';
import { PAYMENT_METHODS, type ReportPaymentMethod } from './report';
import { formatJakartaDateTime, type IsoDateTime } from './time';

/**
 * Cash drawer of one shift (buka kasir → tutup kasir).
 *
 * Cash that should be in the drawer at close:
 *   modal awal + cash sales + kas masuk - kas keluar
 * A cash sale adds its total (the change already went back to the customer).
 * Voided or refunded sales add nothing.
 */

export type CashMovementType = 'in' | 'out';

export interface ShiftSale {
  status: 'paid' | 'void' | 'refunded';
  paymentMethod: ReportPaymentMethod;
  total: Rupiah;
}

export interface ShiftCashMovement {
  type: CashMovementType;
  amount: Rupiah;
}

export interface ShiftSummary {
  openingCash: Rupiah;
  cashSales: Rupiah;
  cashIn: Rupiah;
  cashOut: Rupiah;
  expectedCash: Rupiah;
  /** Paid sales per method (cash included). */
  salesByMethod: Record<ReportPaymentMethod, { transactions: number; total: Rupiah }>;
  transactions: number;
  totalSales: Rupiah;
  cancelled: number;
}

export function summarizeShift(
  openingCash: Rupiah,
  sales: ShiftSale[],
  movements: ShiftCashMovement[],
): ShiftSummary {
  const salesByMethod = Object.fromEntries(
    PAYMENT_METHODS.map((m) => [m, { transactions: 0, total: 0 }]),
  ) as ShiftSummary['salesByMethod'];
  let transactions = 0;
  let totalSales = 0;
  let cancelled = 0;
  for (const sale of sales) {
    if (sale.status !== 'paid') {
      cancelled++;
      continue;
    }
    transactions++;
    totalSales += sale.total;
    const row = salesByMethod[sale.paymentMethod];
    row.transactions++;
    row.total += sale.total;
  }
  const cashIn = movements.filter((m) => m.type === 'in').reduce((s, m) => s + m.amount, 0);
  const cashOut = movements.filter((m) => m.type === 'out').reduce((s, m) => s + m.amount, 0);
  const cashSales = salesByMethod.cash.total;
  return {
    openingCash,
    cashSales,
    cashIn,
    cashOut,
    expectedCash: openingCash + cashSales + cashIn - cashOut,
    salesByMethod,
    transactions,
    totalSales,
    cancelled,
  };
}

/** "Pas", "Lebih Rp5.000" or "Kurang Rp2.000" (counted minus expected). */
export function formatCashDifference(difference: Rupiah): string {
  if (difference === 0) return 'Pas';
  return `${difference > 0 ? 'Lebih' : 'Kurang'} ${formatRupiah(Math.abs(difference))}`;
}

export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  in: 'Kas masuk',
  out: 'Kas keluar',
};

/** Everything the closing recap shows, independent of how it is stored. */
export interface ShiftRecapView {
  storeName: string;
  deviceLabel: string;
  openedAt: IsoDateTime;
  openedByName: string;
  closedAt: IsoDateTime;
  closedByName: string;
  summary: ShiftSummary;
  countedCash: Rupiah;
  /** Stored at close: counted - expected. */
  cashDifference: Rupiah;
  movements: (ShiftCashMovement & { reason: string })[];
  note: string | null;
}

export interface RecapRow {
  label: string;
  amount: Rupiah;
  negative?: boolean;
  kind: 'normal' | 'total';
}

/** The cash part of the recap, top to bottom. Shared by the screen and the WhatsApp text. */
export function shiftCashRows(view: Pick<ShiftRecapView, 'summary' | 'countedCash'>): RecapRow[] {
  const s = view.summary;
  const rows: RecapRow[] = [
    { label: 'Modal awal', amount: s.openingCash, kind: 'normal' },
    { label: 'Penjualan tunai', amount: s.cashSales, kind: 'normal' },
  ];
  if (s.cashIn) rows.push({ label: 'Kas masuk', amount: s.cashIn, kind: 'normal' });
  if (s.cashOut)
    rows.push({ label: 'Kas keluar', amount: s.cashOut, negative: true, kind: 'normal' });
  rows.push({ label: 'Seharusnya di laci', amount: s.expectedCash, kind: 'total' });
  rows.push({ label: 'Uang fisik', amount: view.countedCash, kind: 'total' });
  return rows;
}

/** Plain-text recap, e.g. to send to the owner on WhatsApp. */
export function formatShiftRecapText(view: ShiftRecapView): string {
  const amount = (row: RecapRow) => `${row.negative ? '-' : ''}${formatRupiah(row.amount)}`;
  const lines = [
    `*Tutup kasir ${view.storeName}*`,
    view.deviceLabel,
    `Buka: ${formatJakartaDateTime(view.openedAt)} (${view.openedByName})`,
    `Tutup: ${formatJakartaDateTime(view.closedAt)} (${view.closedByName})`,
    '',
    ...shiftCashRows(view).map((row) => `${row.label}: ${amount(row)}`),
    `Selisih: ${formatCashDifference(view.cashDifference)}`,
    '',
    `Penjualan: ${view.summary.transactions} transaksi, ${formatRupiah(view.summary.totalSales)}`,
    ...PAYMENT_METHODS.map((m) => {
      const row = view.summary.salesByMethod[m];
      return `- ${PAYMENT_LABELS[m]}: ${row.transactions} transaksi, ${formatRupiah(row.total)}`;
    }),
  ];
  if (view.summary.cancelled) lines.push(`Dibatalkan: ${view.summary.cancelled} transaksi`);
  if (view.movements.length) {
    lines.push('', 'Kas masuk/keluar:');
    for (const m of view.movements) {
      lines.push(`- ${CASH_MOVEMENT_LABELS[m.type]} ${formatRupiah(m.amount)}: ${m.reason}`);
    }
  }
  if (view.note) lines.push('', `Catatan: ${view.note}`);
  return lines.join('\n');
}
