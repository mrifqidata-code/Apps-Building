import { describe, expect, it } from 'vitest';
import {
  formatCashDifference,
  formatShiftRecapText,
  shiftCashRows,
  summarizeShift,
  type ShiftRecapView,
} from './shift';

describe('summarizeShift', () => {
  it('expects modal awal + cash sales + kas masuk - kas keluar in the drawer', () => {
    const summary = summarizeShift(
      200_000,
      [
        { status: 'paid', paymentMethod: 'cash', total: 45_000 },
        { status: 'paid', paymentMethod: 'cash', total: 30_000 },
        { status: 'paid', paymentMethod: 'qris', total: 25_000 },
        { status: 'paid', paymentMethod: 'transfer', total: 100_000 },
        { status: 'void', paymentMethod: 'cash', total: 99_000 },
      ],
      [
        { type: 'out', amount: 15_000 },
        { type: 'out', amount: 5_000 },
        { type: 'in', amount: 50_000 },
      ],
    );
    expect(summary).toMatchObject({
      openingCash: 200_000,
      cashSales: 75_000,
      cashIn: 50_000,
      cashOut: 20_000,
      expectedCash: 200_000 + 75_000 + 50_000 - 20_000,
      transactions: 4,
      totalSales: 200_000,
      cancelled: 1,
    });
    expect(summary.salesByMethod).toEqual({
      cash: { transactions: 2, total: 75_000 },
      qris: { transactions: 1, total: 25_000 },
      transfer: { transactions: 1, total: 100_000 },
    });
  });

  it('expects only the modal awal in a shift without sales', () => {
    expect(summarizeShift(150_000, [], []).expectedCash).toBe(150_000);
  });
});

describe('formatCashDifference', () => {
  it('says whether the drawer has more or less than expected', () => {
    expect(formatCashDifference(0)).toBe('Pas');
    expect(formatCashDifference(5_000)).toBe('Lebih Rp5.000');
    expect(formatCashDifference(-2_500)).toBe('Kurang Rp2.500');
  });
});

describe('shift recap', () => {
  const view: ShiftRecapView = {
    storeName: 'Kedai Kopi Senja',
    deviceLabel: 'K1 · HP Kasir',
    openedAt: '2026-10-10T00:00:00.000Z',
    openedByName: 'Sari',
    closedAt: '2026-10-10T10:05:00.000Z',
    closedByName: 'Sari',
    summary: summarizeShift(
      200_000,
      [
        { status: 'paid', paymentMethod: 'cash', total: 75_000 },
        { status: 'paid', paymentMethod: 'qris', total: 25_000 },
      ],
      [{ type: 'out', amount: 20_000 }],
    ),
    countedCash: 250_000,
    cashDifference: -5_000,
    movements: [{ type: 'out', amount: 20_000, reason: 'Beli es batu' }],
    note: 'Uang Rp5.000 terpakai parkir',
  };

  it('lists the cash rows in order, leaving out kas masuk when there was none', () => {
    expect(shiftCashRows(view).map((r) => [r.label, r.amount])).toEqual([
      ['Modal awal', 200_000],
      ['Penjualan tunai', 75_000],
      ['Kas keluar', 20_000],
      ['Seharusnya di laci', 255_000],
      ['Uang fisik', 250_000],
    ]);
  });

  it('formats a WhatsApp text', () => {
    expect(formatShiftRecapText(view)).toBe(
      [
        '*Tutup kasir Kedai Kopi Senja*',
        'K1 · HP Kasir',
        'Buka: 10 Okt 2026 07.00 (Sari)',
        'Tutup: 10 Okt 2026 17.05 (Sari)',
        '',
        'Modal awal: Rp200.000',
        'Penjualan tunai: Rp75.000',
        'Kas keluar: -Rp20.000',
        'Seharusnya di laci: Rp255.000',
        'Uang fisik: Rp250.000',
        'Selisih: Kurang Rp5.000',
        '',
        'Penjualan: 2 transaksi, Rp100.000',
        '- Tunai: 1 transaksi, Rp75.000',
        '- QRIS: 1 transaksi, Rp25.000',
        '- Transfer: 0 transaksi, Rp0',
        '',
        'Kas masuk/keluar:',
        '- Kas keluar Rp20.000: Beli es batu',
        '',
        'Catatan: Uang Rp5.000 terpakai parkir',
      ].join('\n'),
    );
  });
});
