import { describe, expect, it } from 'vitest';
import {
  calculateCart,
  discountAmountOf,
  isDiscountWithinLimit,
  type TaxSettings,
} from './pricing';

const noTax: TaxSettings = { pricesIncludeTax: false, serviceBps: 0, pb1Bps: 0 };

describe('calculateCart without tax', () => {
  it('sums unit price times quantity', () => {
    const totals = calculateCart(
      [
        { unitPrice: 22_000, qty: 2 },
        { unitPrice: 15_000, qty: 1 },
      ],
      null,
      noTax,
    );
    expect(totals.subtotal).toBe(59_000);
    expect(totals.total).toBe(59_000);
    expect(totals.totalDiscount).toBe(0);
  });

  it('applies line discounts by amount and by percent', () => {
    const totals = calculateCart(
      [
        { unitPrice: 25_000, qty: 2, discount: { type: 'amount', value: 5_000 } },
        { unitPrice: 18_000, qty: 1, discount: { type: 'percent', value: 1_000 } }, // 10%
      ],
      null,
      noTax,
    );
    expect(totals.lines.map((l) => l.lineTotal)).toEqual([45_000, 16_200]);
    expect(totals.grossSubtotal).toBe(68_000);
    expect(totals.subtotal).toBe(61_200);
  });

  it('applies a transaction discount after line discounts', () => {
    const totals = calculateCart(
      [{ unitPrice: 20_000, qty: 3, discount: { type: 'amount', value: 10_000 } }],
      { type: 'percent', value: 1_000 },
      noTax,
    );
    expect(totals.subtotal).toBe(50_000);
    expect(totals.transactionDiscountAmount).toBe(5_000);
    expect(totals.totalDiscount).toBe(15_000);
    expect(totals.total).toBe(45_000);
  });

  it('never lets a discount make anything negative', () => {
    const totals = calculateCart(
      [{ unitPrice: 8_000, qty: 1, discount: { type: 'amount', value: 50_000 } }],
      { type: 'amount', value: 1_000 },
      noTax,
    );
    expect(totals.lines[0]!.lineTotal).toBe(0);
    expect(totals.total).toBe(0);
  });

  it('rounds percentage discounts to whole rupiah', () => {
    expect(discountAmountOf(12_345, { type: 'percent', value: 1_000 })).toBe(1_235);
  });

  it('handles an empty cart', () => {
    expect(calculateCart([], null, noTax).total).toBe(0);
  });

  it('rejects invalid input', () => {
    expect(() => calculateCart([{ unitPrice: 1_000, qty: 0 }], null, noTax)).toThrow(RangeError);
    expect(() => calculateCart([{ unitPrice: 1_000.5, qty: 1 }], null, noTax)).toThrow(RangeError);
    expect(() =>
      calculateCart([{ unitPrice: 1_000, qty: 1 }], { type: 'percent', value: 10_001 }, noTax),
    ).toThrow(RangeError);
    expect(() =>
      calculateCart([{ unitPrice: 1_000, qty: 1 }], { type: 'amount', value: -1 }, noTax),
    ).toThrow(RangeError);
  });
});

describe('calculateCart with service and PB1 added on top ("++")', () => {
  const tax: TaxSettings = { pricesIncludeTax: false, serviceBps: 500, pb1Bps: 1_000 };

  it('charges service on the discounted subtotal and PB1 on subtotal plus service', () => {
    const totals = calculateCart(
      [{ unitPrice: 50_000, qty: 2 }],
      { type: 'amount', value: 10_000 },
      tax,
    );
    // 100.000 - 10.000 = 90.000; service 5% = 4.500; PB1 10% of 94.500 = 9.450
    expect(totals.serviceAmount).toBe(4_500);
    expect(totals.taxAmount).toBe(9_450);
    expect(totals.total).toBe(103_950);
  });

  it('rounds service and PB1 to whole rupiah', () => {
    const totals = calculateCart([{ unitPrice: 12_345, qty: 1 }], null, tax);
    expect(totals.serviceAmount).toBe(617); // 617.25
    expect(totals.taxAmount).toBe(1_296); // 1296.2
    expect(totals.total).toBe(14_258);
  });

  it('works with only PB1 or only service', () => {
    const pb1Only = calculateCart([{ unitPrice: 25_000, qty: 1 }], null, {
      ...tax,
      serviceBps: 0,
    });
    expect(pb1Only.taxAmount).toBe(2_500);
    expect(pb1Only.total).toBe(27_500);
  });
});

describe('calculateCart with prices that already include tax ("nett")', () => {
  const tax: TaxSettings = { pricesIncludeTax: true, serviceBps: 500, pb1Bps: 1_000 };

  it('keeps the total equal to the menu price and splits out the parts exactly', () => {
    const totals = calculateCart([{ unitPrice: 115_500, qty: 1 }], null, tax);
    // 115.500 = 100.000 x 1,05 x 1,10
    expect(totals.total).toBe(115_500);
    expect(totals.serviceAmount).toBe(5_000);
    expect(totals.taxAmount).toBe(10_500);
  });

  it('always has parts that add up to the total, even with awkward numbers', () => {
    for (const price of [1, 999, 12_345, 22_000, 87_654, 1_000_003]) {
      const totals = calculateCart([{ unitPrice: price, qty: 1 }], null, tax);
      const base = totals.total - totals.serviceAmount - totals.taxAmount;
      expect(base).toBeGreaterThanOrEqual(0);
      expect(base + totals.serviceAmount + totals.taxAmount).toBe(price);
      expect(totals.total).toBe(price);
    }
  });
});

describe('isDiscountWithinLimit', () => {
  const cart = (discount: number) =>
    calculateCart([{ unitPrice: 100_000, qty: 1 }], { type: 'amount', value: discount }, noTax);

  it('allows no discount even when the limit is zero', () => {
    expect(isDiscountWithinLimit(cart(0), 0)).toBe(true);
  });

  it('compares the total discount against the gross subtotal', () => {
    expect(isDiscountWithinLimit(cart(10_000), 1_000)).toBe(true);
    expect(isDiscountWithinLimit(cart(10_001), 1_000)).toBe(false);
    expect(isDiscountWithinLimit(cart(1), 0)).toBe(false);
  });
});
