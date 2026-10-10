import { csvDate, csvDateTime, csvTime, toCsv, type CsvCell } from './csv';
import type { Rupiah } from './money';
import { PAYMENT_LABELS } from './receipt-text';
import {
  transactionFigures,
  type ProductRow,
  type ReportItem,
  type ReportTransaction,
} from './report';
import { CASH_MOVEMENT_LABELS, type CashMovementType, type ShiftSummary } from './shift';
import type { IsoDateTime } from './time';

/** The CSV exports of the report page. Column names are what the owner sees in the sheet. */

export const STATUS_LABELS: Record<ReportTransaction['status'], string> = {
  paid: 'Lunas',
  void: 'Dibatalkan',
  refunded: 'Direfund',
};

export interface CsvTransaction extends ReportTransaction {
  receiptNo: string;
  deviceId: string;
  cashierId: string;
  amountPaid: Rupiah;
  changeAmount: Rupiah;
}

export interface CsvItem extends ReportItem {
  variants: { name: string }[];
  note: string | null;
}

/** Display names for ids (device code, user name); an empty string when unknown. */
export interface CsvNames {
  device: (id: string) => string;
  user: (id: string) => string;
}

const byTime = <T extends { createdAt: IsoDateTime; id: string }>(a: T, b: T) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

function groupItems<T extends ReportItem>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const list = grouped.get(item.transactionId);
    if (list) list.push(item);
    else grouped.set(item.transactionId, [item]);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return grouped;
}

/** One row per transaction, every status (filter on "Status" for Lunas). */
export function transactionsCsv(
  transactions: CsvTransaction[],
  items: ReportItem[],
  names: CsvNames,
): string {
  const grouped = groupItems(items);
  const rows: CsvCell[][] = [...transactions].sort(byTime).map((t) => {
    const f = transactionFigures(t, grouped.get(t.id) ?? []);
    return [
      csvDate(t.createdAt),
      csvTime(t.createdAt),
      t.receiptNo,
      names.device(t.deviceId),
      names.user(t.cashierId),
      STATUS_LABELS[t.status],
      PAYMENT_LABELS[t.paymentMethod],
      f.grossSales,
      f.discount,
      f.netSales,
      t.serviceAmount,
      t.taxAmount,
      t.total,
      f.cost,
      f.grossProfit,
      t.amountPaid,
      t.changeAmount,
    ];
  });
  return toCsv(
    [
      'Tanggal',
      'Jam',
      'No. struk',
      'Perangkat',
      'Kasir',
      'Status',
      'Metode bayar',
      'Penjualan kotor',
      'Diskon',
      'Penjualan bersih',
      'Biaya layanan',
      'PB1',
      'Total',
      'HPP',
      'Laba kotor',
      'Dibayar',
      'Kembalian',
    ],
    rows,
  );
}

/** One row per item line. "Penjualan bersih" already includes the item's share of the transaction discount. */
export function itemsCsv(transactions: CsvTransaction[], items: CsvItem[]): string {
  const grouped = groupItems(items);
  const rows: CsvCell[][] = [];
  for (const t of [...transactions].sort(byTime)) {
    const lines = grouped.get(t.id) ?? [];
    const f = transactionFigures(t, lines);
    for (const item of lines) {
      const itemFigures = f.items.get(item.id)!;
      rows.push([
        csvDate(t.createdAt),
        csvTime(t.createdAt),
        t.receiptNo,
        STATUS_LABELS[t.status],
        item.productName,
        item.variants.map((v) => v.name).join(', '),
        item.qty,
        item.unitPrice,
        itemFigures.grossSales,
        itemFigures.itemDiscount,
        itemFigures.netSales,
        itemFigures.cost,
        itemFigures.grossProfit,
        item.note,
      ]);
    }
  }
  return toCsv(
    [
      'Tanggal',
      'Jam',
      'No. struk',
      'Status',
      'Produk',
      'Varian',
      'Qty',
      'Harga satuan',
      'Penjualan kotor',
      'Diskon item',
      'Penjualan bersih',
      'HPP',
      'Laba kotor',
      'Catatan',
    ],
    rows,
  );
}

export function productsCsv(products: ProductRow[]): string {
  return toCsv(
    ['Produk', 'Qty terjual', 'Penjualan kotor', 'Penjualan bersih', 'HPP', 'Laba kotor'],
    products.map((p) => [p.name, p.qty, p.grossSales, p.netSales, p.cost, p.grossProfit]),
  );
}

export interface CsvShift {
  deviceLabel: string;
  openedAt: IsoDateTime;
  openedByName: string;
  closedAt: IsoDateTime | null;
  closedByName: string | null;
  summary: ShiftSummary;
  /** Stored at close; null while the shift is still open. */
  expectedCash: Rupiah | null;
  countedCash: Rupiah | null;
  cashDifference: Rupiah | null;
  note: string | null;
}

export function shiftsCsv(shifts: CsvShift[]): string {
  const rows: CsvCell[][] = [...shifts]
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
    .map((s) => [
      s.deviceLabel,
      csvDateTime(s.openedAt),
      s.openedByName,
      s.closedAt ? csvDateTime(s.closedAt) : 'Masih buka',
      s.closedByName,
      s.summary.openingCash,
      s.summary.cashSales,
      s.summary.cashIn,
      s.summary.cashOut,
      s.expectedCash,
      s.countedCash,
      s.cashDifference,
      s.summary.transactions,
      s.summary.totalSales,
      s.note,
    ]);
  return toCsv(
    [
      'Perangkat',
      'Dibuka',
      'Dibuka oleh',
      'Ditutup',
      'Ditutup oleh',
      'Modal awal',
      'Penjualan tunai',
      'Kas masuk',
      'Kas keluar',
      'Seharusnya di laci',
      'Uang fisik',
      'Selisih',
      'Jumlah transaksi',
      'Total penjualan',
      'Catatan',
    ],
    rows,
  );
}

export interface CsvCashMovement {
  id: string;
  createdAt: IsoDateTime;
  deviceId: string;
  userId: string;
  type: CashMovementType;
  amount: Rupiah;
  reason: string;
}

export function cashMovementsCsv(movements: CsvCashMovement[], names: CsvNames): string {
  return toCsv(
    ['Tanggal', 'Jam', 'Perangkat', 'Oleh', 'Jenis', 'Jumlah', 'Alasan'],
    [...movements]
      .sort(byTime)
      .map((m) => [
        csvDate(m.createdAt),
        csvTime(m.createdAt),
        names.device(m.deviceId),
        names.user(m.userId),
        CASH_MOVEMENT_LABELS[m.type],
        m.amount,
        m.reason,
      ]),
  );
}
