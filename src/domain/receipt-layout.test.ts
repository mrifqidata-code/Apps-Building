import { describe, expect, it } from 'vitest';
import {
  RECEIPT_WIDTH,
  buildReceiptLines,
  buildTestPageLines,
  columns,
  toPrintable,
  wrap,
} from './receipt-layout';
import type { ReceiptView } from './receipt-text';

const receipt: ReceiptView = {
  storeName: 'Kedai Kopi Senja',
  storeAddress: 'Jl. Contoh No. 1, Kebayoran Baru, Jakarta Selatan',
  storePhone: '0812-3456-7890',
  footer: 'Terima kasih, sampai jumpa lagi!',
  receiptNo: 'K1-261009-0001',
  createdAt: '2026-10-09T00:04:00.000Z',
  cashierName: 'Sari',
  lines: [
    {
      name: 'Kopi Susu Gula Aren',
      variantNames: ['Large', 'Extra Shot'],
      qty: 1,
      unitPrice: 32_000,
      discountAmount: 3_200,
      lineTotal: 28_800,
      note: 'kurang manis',
    },
    {
      name: 'Caffè Latte',
      variantNames: [],
      qty: 2,
      unitPrice: 25_000,
      discountAmount: 0,
      lineTotal: 50_000,
      note: null,
    },
  ],
  subtotal: 78_800,
  discountAmount: 1_800,
  pricesIncludeTax: false,
  serviceBps: 500,
  serviceAmount: 3_850,
  taxBps: 1_000,
  taxAmount: 8_085,
  total: 88_935,
  paymentMethod: 'cash',
  amountPaid: 100_000,
  changeAmount: 11_065,
  status: 'paid',
};

describe('toPrintable', () => {
  it('turns accents and typographic characters into plain ASCII', () => {
    expect(toPrintable('Caffè Latte – “Spesial”')).toBe('Caffe Latte - "Spesial"');
    expect(toPrintable('Es teh\nmanis')).toBe('Es teh manis');
    expect(toPrintable('Kopi ☕')).toBe('Kopi ?');
  });
});

describe('wrap and columns', () => {
  it('wraps on word boundaries and breaks overly long words', () => {
    expect(wrap('Jl. Contoh No. 1, Kebayoran Baru, Jakarta Selatan', 32)).toEqual([
      'Jl. Contoh No. 1, Kebayoran',
      'Baru, Jakarta Selatan',
    ]);
    expect(wrap('A'.repeat(40), 32)).toEqual(['A'.repeat(32), 'A'.repeat(8)]);
  });

  it('keeps the leading indent on every wrapped line', () => {
    expect(wrap('  Catatan: tanpa gula, es sedikit, susu oat', 20)).toEqual([
      '  Catatan: tanpa',
      '  gula, es sedikit,',
      '  susu oat',
    ]);
  });

  it('puts the amount flush right on the same line when it fits', () => {
    expect(columns('Total', 'Rp55.800', 32)).toEqual([`Total${' '.repeat(19)}Rp55.800`]);
  });

  it('moves the amount to the next line when the label is too long', () => {
    const lines = columns('Biaya layanan dan pajak restoran (PB1)', 'Rp100.000', 32);
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    expect(lines[lines.length - 1]!.endsWith('Rp100.000')).toBe(true);
  });
});

describe('buildReceiptLines', () => {
  const lines = buildReceiptLines(receipt);
  const texts = lines.map((l) => l.text);

  it('never exceeds 32 characters per line', () => {
    for (const line of lines) expect(line.text.length).toBeLessThanOrEqual(RECEIPT_WIDTH);
  });

  it('prints the store header centered, name bold and tall', () => {
    expect(lines[0]).toEqual({
      text: 'Kedai Kopi Senja',
      align: 'center',
      bold: true,
      tall: true,
    });
    expect(texts).toContain('Telp. 0812-3456-7890');
  });

  it('prints items, discounts, notes and the summary in WIB', () => {
    expect(texts).toContain('No. K1-261009-0001');
    expect(texts).toContain('9 Okt 2026 07.04');
    expect(texts).toContain('Kopi Susu Gula Aren (Large,');
    expect(texts).toContain('Extra Shot)');
    expect(texts).toContain(`  1 x Rp32.000${' '.repeat(10)}Rp32.000`);
    expect(texts).toContain(`  Diskon${' '.repeat(16)}-Rp3.200`);
    expect(texts).toContain('  Catatan: kurang manis');
    expect(texts).toContain('Caffe Latte');
    expect(texts).toContain(`Biaya layanan (5%)${' '.repeat(7)}Rp3.850`);
    expect(texts).toContain(`PB1 (10%)${' '.repeat(16)}Rp8.085`);
    expect(texts).toContain(`Kembalian${' '.repeat(15)}Rp11.065`);
    expect(texts[texts.length - 1]).toBe('Terima kasih, sampai jumpa lagi!');
  });

  it('emphasizes the total', () => {
    const total = lines.find((l) => l.text.startsWith('TOTAL'));
    expect(total).toEqual({
      text: `TOTAL${' '.repeat(19)}Rp88.935`,
      bold: true,
      tall: true,
    });
  });

  it('marks voided receipts', () => {
    const voided = buildReceiptLines({ ...receipt, status: 'void' }).map((l) => l.text);
    expect(voided).toContain('*** TRANSAKSI DIBATALKAN ***');
  });
});

describe('buildTestPageLines', () => {
  it('fits the paper and shows a character ruler', () => {
    const lines = buildTestPageLines('Kedai Kopi Senja', '2026-10-09T00:04:00.000Z');
    expect(lines.map((l) => l.text)).toContain('12345678901234567890123456789012');
    for (const line of lines) expect(line.text.length).toBeLessThanOrEqual(RECEIPT_WIDTH);
  });
});
