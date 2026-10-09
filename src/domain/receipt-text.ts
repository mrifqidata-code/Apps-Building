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

/** Plain-text receipt for WhatsApp; *text* renders bold there. */
export function formatReceiptText(r: ReceiptView): string {
  const out: string[] = [];
  out.push(`*${r.storeName}*`);
  if (r.storeAddress) out.push(r.storeAddress);
  if (r.storePhone) out.push(`Telp. ${r.storePhone}`);
  if (r.status === 'void') out.push('*TRANSAKSI DIBATALKAN*');
  if (r.status === 'refunded') out.push('*TRANSAKSI DIREFUND*');
  out.push(SEPARATOR);
  out.push(`No. ${r.receiptNo}`);
  out.push(formatJakartaDateTime(r.createdAt));
  out.push(`Kasir: ${r.cashierName}`);
  out.push(SEPARATOR);

  for (const line of r.lines) {
    out.push(
      line.variantNames.length ? `${line.name} (${line.variantNames.join(', ')})` : line.name,
    );
    out.push(
      `  ${line.qty} x ${formatRupiah(line.unitPrice)} = ${formatRupiah(line.qty * line.unitPrice)}`,
    );
    if (line.discountAmount > 0) out.push(`  Diskon -${formatRupiah(line.discountAmount)}`);
    if (line.note) out.push(`  Catatan: ${line.note}`);
  }

  out.push(SEPARATOR);
  const addsCharges = !r.pricesIncludeTax && (r.serviceAmount > 0 || r.taxAmount > 0);
  const showSubtotal = r.discountAmount > 0 || addsCharges;
  if (showSubtotal) out.push(`Subtotal: ${formatRupiah(r.subtotal)}`);
  if (r.discountAmount > 0) out.push(`Diskon: -${formatRupiah(r.discountAmount)}`);
  if (!r.pricesIncludeTax) {
    if (r.serviceAmount > 0) {
      out.push(`Biaya layanan (${formatBps(r.serviceBps)}): ${formatRupiah(r.serviceAmount)}`);
    }
    if (r.taxAmount > 0) out.push(`PB1 (${formatBps(r.taxBps)}): ${formatRupiah(r.taxAmount)}`);
  }
  out.push(`*Total: ${formatRupiah(r.total)}*`);
  if (r.pricesIncludeTax && (r.serviceAmount > 0 || r.taxAmount > 0)) {
    if (r.serviceAmount > 0) {
      out.push(`  Termasuk layanan (${formatBps(r.serviceBps)}): ${formatRupiah(r.serviceAmount)}`);
    }
    if (r.taxAmount > 0) {
      out.push(`  Termasuk PB1 (${formatBps(r.taxBps)}): ${formatRupiah(r.taxAmount)}`);
    }
  }
  out.push(`${PAYMENT_LABELS[r.paymentMethod]}: ${formatRupiah(r.amountPaid)}`);
  if (r.paymentMethod === 'cash') out.push(`Kembalian: ${formatRupiah(r.changeAmount)}`);

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
