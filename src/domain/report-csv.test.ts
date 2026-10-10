import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvCell, csvDateTime, toCsv } from './csv';
import { buildSalesReport } from './report';
import {
  cashMovementsCsv,
  itemsCsv,
  productsCsv,
  shiftsCsv,
  transactionsCsv,
  type CsvItem,
  type CsvNames,
  type CsvTransaction,
} from './report-csv';
import { summarizeShift } from './shift';

describe('csv', () => {
  it('quotes cells with commas, quotes and line breaks', () => {
    expect(csvCell('Kopi, Susu')).toBe('"Kopi, Susu"');
    expect(csvCell('Es "Jumbo"')).toBe('"Es ""Jumbo"""');
    expect(csvCell('baris\nbaru')).toBe('"baris\nbaru"');
    expect(csvCell('Biasa')).toBe('Biasa');
    expect(csvCell(null)).toBe('');
    expect(csvCell(15_000)).toBe('15000');
    expect(csvCell(-2_000)).toBe('-2000');
  });

  it('stops text from running as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+62812')).toBe("'+62812");
    expect(csvCell('-beli es')).toBe("'-beli es");
    expect(csvCell('@kasir')).toBe("'@kasir");
  });

  it('never writes decimals', () => {
    expect(() => csvCell(1.5)).toThrow(RangeError);
  });

  it('joins rows with CRLF and ends with a line break', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('a,b\r\n1,x\r\n');
    expect(CSV_BOM).toBe('﻿');
  });

  it('writes WIB date and time', () => {
    expect(csvDateTime('2026-10-09T17:05:00.000Z')).toBe('2026-10-10 00:05');
  });
});

const names: CsvNames = {
  device: (id) => ({ d1: 'K1' })[id] ?? '',
  user: (id) => ({ u1: 'Sari', u2: 'Budi' })[id] ?? '',
};

const tx: CsvTransaction = {
  id: 't1',
  createdAt: '2026-10-10T05:30:00.000Z',
  receiptNo: 'K1-261010-0001',
  deviceId: 'd1',
  cashierId: 'u1',
  status: 'paid',
  paymentMethod: 'cash',
  discountAmount: 5_000,
  pricesIncludeTax: false,
  serviceAmount: 0,
  taxAmount: 0,
  total: 45_000,
  amountPaid: 50_000,
  changeAmount: 5_000,
};

const items: CsvItem[] = [
  {
    id: 't1-a',
    transactionId: 't1',
    productId: 'p1',
    productName: 'Kopi Susu',
    variants: [{ name: 'Large' }, { name: 'Extra Shot' }],
    qty: 2,
    unitPrice: 20_000,
    unitCost: 8_000,
    lineTotal: 40_000,
    note: 'Kurang manis',
  },
  {
    id: 't1-b',
    transactionId: 't1',
    productId: 'p2',
    productName: 'Roti Bakar',
    variants: [],
    qty: 1,
    unitPrice: 10_000,
    unitCost: 4_000,
    lineTotal: 10_000,
    note: null,
  },
];

const lines = (csv: string) => csv.trimEnd().split('\r\n');

describe('report CSV exports', () => {
  it('exports one row per transaction with profit after the transaction discount', () => {
    const voided: CsvTransaction = {
      ...tx,
      id: 't0',
      createdAt: '2026-10-10T01:00:00.000Z',
      receiptNo: 'K1-261010-0000',
      status: 'void',
      cashierId: 'u9',
    };
    expect(lines(transactionsCsv([tx, voided], items, names))).toEqual([
      'Tanggal,Jam,No. struk,Perangkat,Kasir,Status,Metode bayar,Penjualan kotor,Diskon,Penjualan bersih,Biaya layanan,PB1,Total,HPP,Laba kotor,Dibayar,Kembalian',
      '2026-10-10,08:00,K1-261010-0000,K1,,Dibatalkan,Tunai,0,5000,45000,0,0,45000,0,45000,50000,5000',
      '2026-10-10,12:30,K1-261010-0001,K1,Sari,Lunas,Tunai,50000,5000,45000,0,0,45000,20000,25000,50000,5000',
    ]);
  });

  it('exports item lines with their share of the transaction discount', () => {
    expect(lines(itemsCsv([tx], items))).toEqual([
      'Tanggal,Jam,No. struk,Status,Produk,Varian,Qty,Harga satuan,Penjualan kotor,Diskon item,Penjualan bersih,HPP,Laba kotor,Catatan',
      '2026-10-10,12:30,K1-261010-0001,Lunas,Kopi Susu,"Large, Extra Shot",2,20000,40000,0,36000,16000,20000,Kurang manis',
      '2026-10-10,12:30,K1-261010-0001,Lunas,Roti Bakar,,1,10000,10000,0,9000,4000,5000,',
    ]);
  });

  it('exports the per-product summary', () => {
    const report = buildSalesReport([tx], items);
    expect(lines(productsCsv(report.byProduct))).toEqual([
      'Produk,Qty terjual,Penjualan kotor,Penjualan bersih,HPP,Laba kotor',
      'Kopi Susu,2,40000,36000,16000,20000',
      'Roti Bakar,1,10000,9000,4000,5000',
    ]);
  });

  it('exports closed and open shifts', () => {
    const summary = summarizeShift(
      200_000,
      [{ status: 'paid', paymentMethod: 'cash', total: 45_000 }],
      [{ type: 'out', amount: 20_000 }],
    );
    const csv = shiftsCsv([
      {
        deviceLabel: 'K2',
        openedAt: '2026-10-10T02:00:00.000Z',
        openedByName: 'Budi',
        closedAt: null,
        closedByName: null,
        summary,
        expectedCash: null,
        countedCash: null,
        cashDifference: null,
        note: null,
      },
      {
        deviceLabel: 'K1',
        openedAt: '2026-10-10T00:00:00.000Z',
        openedByName: 'Sari',
        closedAt: '2026-10-10T10:00:00.000Z',
        closedByName: 'Sari',
        summary,
        expectedCash: 225_000,
        countedCash: 220_000,
        cashDifference: -5_000,
        note: 'Parkir',
      },
    ]);
    expect(lines(csv)).toEqual([
      'Perangkat,Dibuka,Dibuka oleh,Ditutup,Ditutup oleh,Modal awal,Penjualan tunai,Kas masuk,Kas keluar,Seharusnya di laci,Uang fisik,Selisih,Jumlah transaksi,Total penjualan,Catatan',
      'K1,2026-10-10 07:00,Sari,2026-10-10 17:00,Sari,200000,45000,0,20000,225000,220000,-5000,1,45000,Parkir',
      'K2,2026-10-10 09:00,Budi,Masih buka,,200000,45000,0,20000,,,,1,45000,',
    ]);
  });

  it('exports kas masuk/keluar, with the reason protected against formulas', () => {
    const csv = cashMovementsCsv(
      [
        {
          id: 'm1',
          createdAt: '2026-10-10T03:00:00.000Z',
          deviceId: 'd1',
          userId: 'u2',
          type: 'out',
          amount: 15_000,
          reason: '=1+1',
        },
      ],
      names,
    );
    expect(lines(csv)).toEqual([
      'Tanggal,Jam,Perangkat,Oleh,Jenis,Jumlah,Alasan',
      "2026-10-10,10:00,K1,Budi,Kas keluar,15000,'=1+1",
    ]);
  });
});
