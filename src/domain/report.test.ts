import { describe, expect, it } from 'vitest';
import { calculateCart, type Discount, type TaxSettings } from './pricing';
import {
  buildSalesReport,
  busiestHour,
  formatHourRange,
  transactionFigures,
  type ReportItem,
  type ReportTransaction,
} from './report';

interface TestProduct {
  id: string;
  name: string;
  price: number;
  cost: number;
}

const KOPI: TestProduct = { id: 'p-kopi', name: 'Kopi Susu', price: 20_000, cost: 8_000 };
const ROTI: TestProduct = { id: 'p-roti', name: 'Roti Bakar', price: 10_000, cost: 4_000 };
const TEH: TestProduct = { id: 'p-teh', name: 'Es Teh', price: 10_000, cost: 2_000 };

const NO_TAX: TaxSettings = { pricesIncludeTax: false, serviceBps: 0, pb1Bps: 0 };

let seq = 0;

/** Prices a sale with the real cart pricing, then stores it the way completeSale does. */
function sale(options: {
  at?: string;
  method?: ReportTransaction['paymentMethod'];
  status?: ReportTransaction['status'];
  lines: { product: TestProduct; qty: number; discount?: Discount }[];
  discount?: Discount;
  tax?: TaxSettings;
}): { t: ReportTransaction; items: ReportItem[] } {
  const tax = options.tax ?? NO_TAX;
  const totals = calculateCart(
    options.lines.map((l) => ({ unitPrice: l.product.price, qty: l.qty, discount: l.discount })),
    options.discount,
    tax,
  );
  const id = `t${String(++seq).padStart(4, '0')}`;
  const t: ReportTransaction = {
    id,
    createdAt: options.at ?? '2026-10-10T05:30:00.000Z',
    status: options.status ?? 'paid',
    paymentMethod: options.method ?? 'cash',
    discountAmount: totals.transactionDiscountAmount,
    pricesIncludeTax: tax.pricesIncludeTax,
    serviceAmount: totals.serviceAmount,
    taxAmount: totals.taxAmount,
    total: totals.total,
  };
  const items = options.lines.map((l, i) => ({
    id: `${id}-${i}`,
    transactionId: id,
    productId: l.product.id,
    productName: l.product.name,
    qty: l.qty,
    unitPrice: l.product.price,
    unitCost: l.product.cost,
    lineTotal: totals.lines[i]!.lineTotal,
  }));
  return { t, items };
}

function report(sales: ReturnType<typeof sale>[], days?: string[]) {
  return buildSalesReport(
    sales.map((s) => s.t),
    sales.flatMap((s) => s.items),
    days,
  );
}

const product = (r: ReturnType<typeof report>, id: string) =>
  r.byProduct.find((p) => p.productId === id)!;

describe('gross profit', () => {
  it('is net sales minus HPP', () => {
    const r = report([
      sale({
        lines: [
          { product: KOPI, qty: 2 },
          { product: ROTI, qty: 1 },
        ],
      }),
    ]);
    expect(r.totals).toMatchObject({
      transactions: 1,
      itemQty: 3,
      grossSales: 50_000,
      discount: 0,
      netSales: 50_000,
      cost: 20_000,
      grossProfit: 30_000,
      totalReceived: 50_000,
    });
    expect(product(r, KOPI.id)).toMatchObject({ qty: 2, netSales: 40_000, grossProfit: 24_000 });
    expect(product(r, ROTI.id)).toMatchObject({ qty: 1, netSales: 10_000, grossProfit: 6_000 });
  });

  it('spreads a transaction discount over the items by their totals', () => {
    const r = report([
      sale({
        lines: [
          { product: KOPI, qty: 2 },
          { product: ROTI, qty: 1 },
        ],
        discount: { type: 'percent', value: 1_000 },
      }),
    ]);
    // 10% of 50.000 = 5.000, split 40.000 : 10.000.
    expect(r.totals).toMatchObject({
      grossSales: 50_000,
      discount: 5_000,
      netSales: 45_000,
      cost: 20_000,
      grossProfit: 25_000,
    });
    expect(product(r, KOPI.id)).toMatchObject({
      netSales: 36_000,
      cost: 16_000,
      grossProfit: 20_000,
    });
    expect(product(r, ROTI.id)).toMatchObject({ netSales: 9_000, cost: 4_000, grossProfit: 5_000 });
  });

  it('combines item discounts with a transaction discount', () => {
    const { t, items } = sale({
      lines: [
        { product: KOPI, qty: 2 },
        { product: ROTI, qty: 1, discount: { type: 'amount', value: 2_000 } },
      ],
      discount: { type: 'amount', value: 4_800 },
    });
    const f = transactionFigures(t, items);
    expect(f).toMatchObject({ grossSales: 50_000, discount: 6_800, netSales: 43_200 });
    // 43.200 split 40.000 : 8.000
    expect(f.items.get(items[0]!.id)).toMatchObject({ netSales: 36_000, itemDiscount: 0 });
    expect(f.items.get(items[1]!.id)).toMatchObject({
      grossSales: 10_000,
      itemDiscount: 2_000,
      netSales: 7_200,
      grossProfit: 3_200,
    });
  });

  it('adds up to the rupiah when the discount does not divide evenly', () => {
    const r = report([
      sale({
        lines: [
          { product: ROTI, qty: 1 },
          { product: TEH, qty: 1 },
          { product: { ...TEH, id: 'p-teh2', name: 'Es Jeruk' }, qty: 1 },
        ],
        discount: { type: 'amount', value: 1_000 },
      }),
    ]);
    expect(r.byProduct.map((p) => p.netSales).sort()).toEqual([9_666, 9_667, 9_667]);
    expect(r.byProduct.reduce((s, p) => s + p.netSales, 0)).toBe(r.totals.netSales);
    expect(r.totals.netSales).toBe(29_000);
  });

  it('leaves PB1 and service out of net sales when prices exclude tax', () => {
    const r = report([
      sale({
        lines: [
          { product: KOPI, qty: 2 },
          { product: ROTI, qty: 1 },
        ],
        tax: { pricesIncludeTax: false, serviceBps: 500, pb1Bps: 1_000 },
      }),
    ]);
    // service 5% of 50.000 = 2.500; PB1 10% of 52.500 = 5.250
    expect(r.totals).toMatchObject({
      netSales: 50_000,
      serviceAmount: 2_500,
      taxAmount: 5_250,
      totalReceived: 57_750,
      grossProfit: 30_000,
    });
    expect(r.includesTaxInPrices).toBe(false);
  });

  it('takes PB1 and service out of the price when prices include tax', () => {
    const r = report([
      sale({
        lines: [
          { product: KOPI, qty: 2 },
          { product: ROTI, qty: 1 },
        ],
        tax: { pricesIncludeTax: true, serviceBps: 500, pb1Bps: 1_000 },
      }),
    ]);
    // 50.000 / 1,05 / 1,10 = 43.290; service 2.165; PB1 4.545
    expect(r.totals).toMatchObject({
      grossSales: 50_000,
      discount: 0,
      netSales: 43_290,
      serviceAmount: 2_165,
      taxAmount: 4_545,
      totalReceived: 50_000,
      cost: 20_000,
      grossProfit: 23_290,
    });
    expect(product(r, KOPI.id).netSales).toBe(34_632);
    expect(product(r, ROTI.id).netSales).toBe(8_658);
    expect(r.includesTaxInPrices).toBe(true);
  });

  it('can be negative when HPP is above the selling price', () => {
    const r = report([sale({ lines: [{ product: { ...ROTI, cost: 12_000 }, qty: 1 }] })]);
    expect(r.totals.grossProfit).toBe(-2_000);
  });
});

describe('sales report', () => {
  it('leaves voided and refunded sales out of every figure', () => {
    const r = report([
      sale({ lines: [{ product: KOPI, qty: 1 }] }),
      sale({ lines: [{ product: ROTI, qty: 3 }], status: 'void', method: 'qris' }),
      sale({ lines: [{ product: TEH, qty: 1 }], status: 'refunded' }),
    ]);
    expect(r.totals).toMatchObject({ transactions: 1, totalReceived: 20_000, itemQty: 1 });
    expect(r.cancelled).toEqual({ transactions: 2, total: 40_000 });
    expect(r.byProduct.map((p) => p.productId)).toEqual([KOPI.id]);
    expect(r.byMethod.find((m) => m.method === 'qris')).toMatchObject({ transactions: 0 });
    expect(r.byHour.reduce((s, h) => s + h.transactions, 0)).toBe(1);
  });

  it('groups by payment method', () => {
    const r = report([
      sale({ lines: [{ product: KOPI, qty: 1 }], method: 'cash' }),
      sale({ lines: [{ product: KOPI, qty: 2 }], method: 'qris' }),
      sale({ lines: [{ product: ROTI, qty: 1 }], method: 'cash' }),
    ]);
    expect(r.byMethod).toEqual([
      { method: 'cash', transactions: 2, totalReceived: 30_000 },
      { method: 'qris', transactions: 1, totalReceived: 40_000 },
      { method: 'transfer', transactions: 0, totalReceived: 0 },
    ]);
  });

  it('counts transactions per WIB hour and finds the busiest one', () => {
    const r = report([
      // 05:30 UTC = 12.30 WIB
      sale({ at: '2026-10-10T05:30:00.000Z', lines: [{ product: TEH, qty: 1 }] }),
      sale({ at: '2026-10-10T05:59:00.000Z', lines: [{ product: TEH, qty: 1 }] }),
      // 00:10 UTC = 07.10 WIB
      sale({ at: '2026-10-10T00:10:00.000Z', lines: [{ product: KOPI, qty: 1 }] }),
      sale({ at: '2026-10-10T00:20:00.000Z', lines: [{ product: KOPI, qty: 1 }] }),
      // 16:30 UTC on the 9th = 23.30 WIB
      sale({ at: '2026-10-09T16:30:00.000Z', lines: [{ product: TEH, qty: 1 }] }),
    ]);
    expect(r.byHour).toHaveLength(24);
    expect(r.byHour[12]).toEqual({ hour: 12, transactions: 2, totalReceived: 20_000 });
    expect(r.byHour[7]).toEqual({ hour: 7, transactions: 2, totalReceived: 40_000 });
    expect(r.byHour[23]!.transactions).toBe(1);
    // Same count at 07 and 12: the hour with more money wins.
    expect(busiestHour(r.byHour)?.hour).toBe(7);
    expect(formatHourRange(7)).toBe('07.00–08.00');
    expect(formatHourRange(23)).toBe('23.00–00.00');
  });

  it('has no busiest hour without sales', () => {
    expect(busiestHour(report([]).byHour)).toBeNull();
  });

  it('lists every requested day, with or without sales', () => {
    const r = report(
      [
        sale({ at: '2026-10-05T03:00:00.000Z', lines: [{ product: KOPI, qty: 1 }] }),
        sale({ at: '2026-10-07T03:00:00.000Z', lines: [{ product: ROTI, qty: 2 }] }),
        // 23.30 WIB on the 7th
        sale({ at: '2026-10-07T16:30:00.000Z', lines: [{ product: TEH, qty: 1 }] }),
      ],
      ['2026-10-05', '2026-10-06', '2026-10-07'],
    );
    expect(r.byDay).toEqual([
      {
        date: '2026-10-05',
        transactions: 1,
        totalReceived: 20_000,
        netSales: 20_000,
        grossProfit: 12_000,
      },
      { date: '2026-10-06', transactions: 0, totalReceived: 0, netSales: 0, grossProfit: 0 },
      {
        date: '2026-10-07',
        transactions: 2,
        totalReceived: 30_000,
        netSales: 30_000,
        grossProfit: 20_000,
      },
    ]);
  });

  it('sorts products by net sales, then qty, and uses the latest name', () => {
    const r = report([
      sale({ at: '2026-10-10T01:00:00.000Z', lines: [{ product: TEH, qty: 1 }] }),
      sale({
        at: '2026-10-10T02:00:00.000Z',
        lines: [{ product: { ...TEH, name: 'Es Teh Manis' }, qty: 1 }],
      }),
      sale({ lines: [{ product: KOPI, qty: 1 }] }),
    ]);
    expect(r.byProduct.map((p) => [p.name, p.qty, p.netSales])).toEqual([
      ['Es Teh Manis', 2, 20_000],
      ['Kopi Susu', 1, 20_000],
    ]);
  });

  it('still counts a sale whose items have not synced yet, and says so', () => {
    const { t } = sale({ lines: [{ product: KOPI, qty: 1 }] });
    const r = buildSalesReport([t], []);
    expect(r.totals).toMatchObject({ transactions: 1, netSales: 20_000, cost: 0 });
    expect(r.missingItems).toBe(1);
  });

  it('is empty without transactions', () => {
    const r = report([]);
    expect(r.totals.transactions).toBe(0);
    expect(r.byProduct).toEqual([]);
    expect(r.cancelled).toEqual({ transactions: 0, total: 0 });
  });
});
