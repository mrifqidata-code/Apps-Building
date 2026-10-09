import { describe, expect, it } from 'vitest';
import {
  formatReceiptText,
  normalizeWhatsAppNumber,
  whatsAppShareUrl,
  type ReceiptView,
} from './receipt-text';

const base: ReceiptView = {
  storeName: 'Kedai Kopi Senja',
  storeAddress: 'Jl. Contoh No. 1',
  storePhone: '',
  footer: 'Terima kasih!',
  receiptNo: 'K1-261008-0001',
  createdAt: '2026-10-08T07:30:00.000Z',
  cashierName: 'Sari',
  lines: [
    {
      name: 'Kopi Susu Gula Aren',
      variantNames: ['Large', 'Extra Shot'],
      qty: 2,
      unitPrice: 32_000,
      discountAmount: 0,
      lineTotal: 64_000,
      note: 'kurang manis',
    },
    {
      name: 'Espresso',
      variantNames: [],
      qty: 1,
      unitPrice: 15_000,
      discountAmount: 0,
      lineTotal: 15_000,
      note: null,
    },
  ],
  subtotal: 79_000,
  discountAmount: 0,
  pricesIncludeTax: false,
  serviceBps: 0,
  serviceAmount: 0,
  taxBps: 0,
  taxAmount: 0,
  total: 79_000,
  paymentMethod: 'cash',
  amountPaid: 100_000,
  changeAmount: 21_000,
  status: 'paid',
};

describe('formatReceiptText', () => {
  it('produces a readable cash receipt', () => {
    expect(formatReceiptText(base)).toBe(
      [
        '*Kedai Kopi Senja*',
        'Jl. Contoh No. 1',
        '--------------------------------',
        'No. K1-261008-0001',
        '8 Okt 2026 14.30',
        'Kasir: Sari',
        '--------------------------------',
        'Kopi Susu Gula Aren (Large, Extra Shot)',
        '  2 x Rp32.000 = Rp64.000',
        '  Catatan: kurang manis',
        'Espresso',
        '  1 x Rp15.000 = Rp15.000',
        '--------------------------------',
        '*Total: Rp79.000*',
        'Tunai: Rp100.000',
        'Kembalian: Rp21.000',
        '--------------------------------',
        'Terima kasih!',
      ].join('\n'),
    );
  });

  it('shows discounts, service and PB1 when prices exclude tax', () => {
    const text = formatReceiptText({
      ...base,
      discountAmount: 9_000,
      serviceBps: 500,
      serviceAmount: 3_500,
      taxBps: 1_000,
      taxAmount: 7_350,
      total: 80_850,
      paymentMethod: 'qris',
      amountPaid: 80_850,
      changeAmount: 0,
    });
    expect(text).toContain('Subtotal: Rp79.000');
    expect(text).toContain('Diskon: -Rp9.000');
    expect(text).toContain('Biaya layanan (5%): Rp3.500');
    expect(text).toContain('PB1 (10%): Rp7.350');
    expect(text).toContain('*Total: Rp80.850*');
    expect(text).toContain('QRIS: Rp80.850');
    expect(text).not.toContain('Kembalian');
  });

  it('lists included tax under the total when prices include tax', () => {
    const text = formatReceiptText({
      ...base,
      pricesIncludeTax: true,
      taxBps: 1_000,
      taxAmount: 7_182,
    });
    expect(text).toContain('*Total: Rp79.000*\n  Termasuk PB1 (10%): Rp7.182');
    expect(text).not.toContain('Subtotal');
  });

  it('shows line discounts and voided status', () => {
    const text = formatReceiptText({
      ...base,
      status: 'void',
      lines: [{ ...base.lines[1]!, discountAmount: 1_500, lineTotal: 13_500 }],
    });
    expect(text).toContain('*TRANSAKSI DIBATALKAN*');
    expect(text).toContain('  Diskon -Rp1.500');
  });
});

describe('WhatsApp helpers', () => {
  it('normalizes Indonesian numbers', () => {
    expect(normalizeWhatsAppNumber('0812-3456-7890')).toBe('6281234567890');
    expect(normalizeWhatsAppNumber('+62 812 3456 7890')).toBe('6281234567890');
    expect(normalizeWhatsAppNumber('81234567890')).toBe('6281234567890');
    expect(normalizeWhatsAppNumber('6281234567890')).toBe('6281234567890');
    expect(normalizeWhatsAppNumber('12345')).toBeNull();
    expect(normalizeWhatsAppNumber('')).toBeNull();
  });

  it('builds a wa.me link with the text encoded', () => {
    expect(whatsAppShareUrl('Total: Rp10.000\nTerima kasih', '6281234567890')).toBe(
      'https://wa.me/6281234567890?text=Total%3A%20Rp10.000%0ATerima%20kasih',
    );
    expect(whatsAppShareUrl('Hai')).toBe('https://wa.me/?text=Hai');
  });
});
