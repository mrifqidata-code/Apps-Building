import { formatRupiah } from './money';
import {
  STATUS_BANNER,
  formatSummaryAmount,
  receiptItemName,
  receiptSummaryRows,
  type ReceiptView,
} from './receipt-text';
import { formatJakartaDateTime, type IsoDateTime } from './time';

/**
 * Receipt laid out for a 58 mm thermal printer: 32 characters per line in
 * the default font (384 dots wide). The printer only knows plain ASCII, so
 * text goes through `toPrintable` first.
 */
export const RECEIPT_WIDTH = 32;

export type Align = 'left' | 'center' | 'right';

export interface PrintLine {
  text: string;
  align?: Align;
  bold?: boolean;
  /** Double height, same width: keeps 32 characters per line. */
  tall?: boolean;
}

const REPLACEMENTS: Record<string, string> = {
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '×': 'x',
  '•': '*',
};

/** "Caffè Latte – Large" -> "Caffe Latte - Large"; anything else non-ASCII becomes "?". */
export function toPrintable(text: string): string {
  return text
    .replace(/[–—‘’“”…×•]/g, (c) => REPLACEMENTS[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?');
}

/**
 * Word-wraps text to `width`, breaking words that are longer than a line.
 * Leading spaces are kept as an indent on every wrapped line.
 */
export function wrap(text: string, width = RECEIPT_WIDTH): string[] {
  const printable = toPrintable(text);
  const indent = /^ */.exec(printable)![0].slice(0, Math.max(0, width - 1));
  const room = width - indent.length;
  const words = printable.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (let word of words) {
    while (word.length > room) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, room));
      word = word.slice(room);
    }
    if (!word) continue;
    if (!current) current = word;
    else if (current.length + 1 + word.length <= room) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.map((line) => indent + line);
}

/** Label on the left, amount flush right; wraps the label if both do not fit. */
export function columns(left: string, right: string, width = RECEIPT_WIDTH): string[] {
  const l = toPrintable(left);
  const r = toPrintable(right);
  if (l.length + 1 + r.length <= width) return [l + ' '.repeat(width - l.length - r.length) + r];
  const wrapped = wrap(l, width);
  const last = wrapped[wrapped.length - 1] ?? '';
  if (last.length + 1 + r.length <= width) {
    wrapped[wrapped.length - 1] = last + ' '.repeat(width - last.length - r.length) + r;
    return wrapped;
  }
  return [...wrapped, r.padStart(width)];
}

const separator = (width: number): PrintLine => ({ text: '-'.repeat(width) });

export function buildReceiptLines(r: ReceiptView, width = RECEIPT_WIDTH): PrintLine[] {
  const out: PrintLine[] = [];
  const plain = (lines: string[], extra: Omit<PrintLine, 'text'> = {}) =>
    lines.forEach((text) => out.push({ text, ...extra }));

  plain(wrap(r.storeName, width), { align: 'center', bold: true, tall: true });
  if (r.storeAddress) plain(wrap(r.storeAddress, width), { align: 'center' });
  if (r.storePhone) plain(wrap(`Telp. ${r.storePhone}`, width), { align: 'center' });
  const banner = STATUS_BANNER[r.status];
  if (banner) plain(wrap(`*** ${banner} ***`, width), { align: 'center', bold: true });

  out.push(separator(width));
  plain(wrap(`No. ${r.receiptNo}`, width));
  plain(wrap(formatJakartaDateTime(r.createdAt), width));
  plain(wrap(`Kasir: ${r.cashierName}`, width));
  out.push(separator(width));

  for (const line of r.lines) {
    plain(wrap(receiptItemName(line), width), { bold: true });
    plain(
      columns(
        `  ${line.qty} x ${formatRupiah(line.unitPrice)}`,
        formatRupiah(line.qty * line.unitPrice),
        width,
      ),
    );
    if (line.discountAmount > 0) {
      plain(columns('  Diskon', `-${formatRupiah(line.discountAmount)}`, width));
    }
    if (line.note) plain(wrap(`  Catatan: ${line.note}`, width));
  }

  out.push(separator(width));
  for (const row of receiptSummaryRows(r)) {
    const label =
      row.kind === 'total' ? 'TOTAL' : row.kind === 'included' ? `  ${row.label}` : row.label;
    plain(columns(label, formatSummaryAmount(row), width), {
      bold: row.kind === 'total',
      tall: row.kind === 'total',
    });
  }

  if (r.footer) {
    out.push(separator(width));
    plain(wrap(r.footer, width), { align: 'center' });
  }
  return out;
}

/** Short page to check that the printer is connected and prints readable text. */
export function buildTestPageLines(
  storeName: string,
  at: IsoDateTime,
  width = RECEIPT_WIDTH,
): PrintLine[] {
  const ruler = '1234567890'.repeat(Math.ceil(width / 10)).slice(0, width);
  return [
    ...wrap(storeName, width).map((text) => ({ text, align: 'center' as const, bold: true })),
    { text: 'TES PRINTER BERHASIL', align: 'center', bold: true, tall: true },
    { text: formatJakartaDateTime(at), align: 'center' },
    separator(width),
    { text: ruler },
    ...columns('Contoh harga', formatRupiah(12_000), width).map((text) => ({ text })),
    separator(width),
    { text: `Lebar kertas: ${width} karakter`, align: 'center' },
  ];
}
