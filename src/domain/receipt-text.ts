import { formatBps, formatRupiah, type Bps, type Rupiah } from './money';
import { formatJakartaDateTime, type IsoDateTime } from './time';

export type ReceiptPaymentMethod = 'cash' | 'qris' | 'transfer';

export interface ReceiptLine {
  name: string;
  variantNames: string[];
  qty: number;
  unitPrice: Rupiah;
  discountAmount: Rupiah;
  lineTotal: Rupiah;
  note: string | null;
}

/** Everything a receipt shows, independent of how it is stored. */
export interface ReceiptView {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  footer: string;
  receiptNo: string;
  createdAt: IsoDateTime;
  cashierName: string;
  lines: ReceiptLine[];
  subtotal: Rupiah;
  discountAmount: Rupiah;
  pricesIncludeTax: boolean;
  serviceBps: Bps;
  serviceAmount: Rupiah;
  taxBps: Bps;
  taxAmount: Rupiah;
  total: Rupiah;
  paymentMethod: ReceiptPaymentMethod;
  amountPaid: Rupiah;
  changeAmount: Rupiah;
  status: 'paid' | 'void' | 'refunded';
}

export const PAYMENT_LABELS: Record<ReceiptPaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
};

const SEPARATOR = '--------------------------------';

/** "Kopi Susu (Large, Extra Shot)" */
export function receiptItemName(line: ReceiptLine): string {
  return line.variantNames.length ? `${line.name} (${line.variantNames.join(', ')})` : line.name;
}

export interface SummaryRow {
  label: string;
  amount: Rupiah;
  /** Shown with a minus sign (discounts). */
  negative?: boolean;
  /** total: emphasized; included: tax already inside the total, shown indented. */
  kind: 'normal' | 'total' | 'included';
}

/**
 * The money rows under the items, shared by the screen, WhatsApp text and
 * printed receipt so they never disagree about what is shown.
 */
export function receiptSummaryRows(r: ReceiptView): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const addsCharges = !r.pricesIncludeTax && (r.serviceAmount > 0 || r.taxAmount > 0);
  if (r.discountAmount > 0 || addsCharges) {
    rows.push({ label: 'Subtotal', amount: r.subtotal, kind: 'normal' });
  }
  if (r.discountAmount > 0) {
    rows.push({ label: 'Diskon', amount: r.discountAmount, negative: true, kind: 'normal' });
  }
  if (!r.pricesIncludeTax && r.serviceAmount > 0) {
    const label = `Biaya layanan (${formatBps(r.serviceBps)})`;
    rows.push({ label, amount: r.serviceAmount, kind: 'normal' });
  }
  if (!r.pricesIncludeTax && r.taxAmount > 0) {
    rows.push({ label: `PB1 (${formatBps(r.taxBps)})`, amount: r.taxAmount, kind: 'normal' });
  }
  rows.push({ label: 'Total', amount: r.total, kind: 'total' });
  if (r.pricesIncludeTax && r.serviceAmount > 0) {
    const label = `Termasuk layanan (${formatBps(r.serviceBps)})`;
    rows.push({ label, amount: r.serviceAmount, kind: 'included' });
  }
  if (r.pricesIncludeTax && r.taxAmount > 0) {
    const label = `Termasuk PB1 (${formatBps(r.taxBps)})`;
    rows.push({ label, amount: r.taxAmount, kind: 'included' });
  }
  rows.push({ label: PAYMENT_LABELS[r.paymentMethod], amount: r.amountPaid, kind: 'normal' });
  if (r.paymentMethod === 'cash') {
    rows.push({ label: 'Kembalian', amount: r.changeAmount, kind: 'normal' });
  }
  return rows;
}

export const formatSummaryAmount = (row: SummaryRow) =>
  `${row.negative ? '-' : ''}${formatRupiah(row.amount)}`;

export const STATUS_BANNER: Record<ReceiptView['status'], string | null> = {
  paid: null,
  void: 'TRANSAKSI DIBATALKAN',
  refunded: 'TRANSAKSI DIREFUND',
};

/** Plain-text receipt for WhatsApp; *text* renders bold there. */
export function formatReceiptText(r: ReceiptView): string {
  const out: string[] = [];
  out.push(`*${r.storeName}*`);
  if (r.storeAddress) out.push(r.storeAddress);
  if (r.storePhone) out.push(`Telp. ${r.storePhone}`);
  if (STATUS_BANNER[r.status]) out.push(`*${STATUS_BANNER[r.status]}*`);
  out.push(SEPARATOR);
  out.push(`No. ${r.receiptNo}`);
  out.push(formatJakartaDateTime(r.createdAt));
  out.push(`Kasir: ${r.cashierName}`);
  out.push(SEPARATOR);

  for (const line of r.lines) {
    out.push(receiptItemName(line));
    out.push(
      `  ${line.qty} x ${formatRupiah(line.unitPrice)} = ${formatRupiah(line.qty * line.unitPrice)}`,
    );
    if (line.discountAmount > 0) out.push(`  Diskon -${formatRupiah(line.discountAmount)}`);
    if (line.note) out.push(`  Catatan: ${line.note}`);
  }

  out.push(SEPARATOR);
  for (const row of receiptSummaryRows(r)) {
    const text = `${row.label}: ${formatSummaryAmount(row)}`;
    out.push(row.kind === 'total' ? `*${text}*` : row.kind === 'included' ? `  ${text}` : text);
  }

  if (r.footer) {
    out.push(SEPARATOR);
    out.push(r.footer);
  }
  return out.join('\n');
}

/**
 * Normalizes an Indonesian WhatsApp number to the international form wa.me
 * expects ("0812-3456-789" -> "628123456789"). Returns null if it does not
 * look like a phone number.
 */
export function normalizeWhatsAppNumber(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.includes('+')) return null;
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

/** wa.me link that opens WhatsApp with the receipt text ready to send. */
export function whatsAppShareUrl(text: string, phone: string | null = null): string {
  return `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`;
}
