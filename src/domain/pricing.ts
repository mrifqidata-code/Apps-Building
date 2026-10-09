import { BPS_PER_100_PERCENT, assertRupiah, percentOf, type Bps, type Rupiah } from './money';

/**
 * Cart pricing. All amounts are whole rupiah; percentages are basis points.
 *
 * Order of operations (agreed with the owner):
 * 1. line gross = unit price (incl. variants) x qty
 * 2. line discount (amount or percent of line gross)
 * 3. subtotal = sum of lines after line discounts
 * 4. transaction discount (amount or percent of subtotal)
 * 5. prices exclude tax ("++"):
 *      service = service% x (subtotal - discount)
 *      PB1     = PB1% x (subtotal - discount + service)
 *    prices include tax ("nett"): the total stays (subtotal - discount)
 *    and service/PB1 are only split out of it for the receipt.
 */

export type Discount = { type: 'amount'; value: Rupiah } | { type: 'percent'; value: Bps };

export interface PricingLineInput {
  unitPrice: Rupiah;
  qty: number;
  discount?: Discount | null;
}

export interface TaxSettings {
  pricesIncludeTax: boolean;
  serviceBps: Bps;
  pb1Bps: Bps;
}

export interface PricedLine {
  gross: Rupiah;
  discountAmount: Rupiah;
  lineTotal: Rupiah;
}

export interface CartTotals {
  lines: PricedLine[];
  /** Sum of line gross amounts, before any discount. */
  grossSubtotal: Rupiah;
  /** Sum of lines after line discounts. */
  subtotal: Rupiah;
  transactionDiscountAmount: Rupiah;
  /** Line discounts plus the transaction discount. */
  totalDiscount: Rupiah;
  serviceAmount: Rupiah;
  taxAmount: Rupiah;
  total: Rupiah;
}

export function assertQty(qty: number): number {
  if (!Number.isSafeInteger(qty) || qty < 1) {
    throw new RangeError(`jumlah harus bilangan bulat minimal 1, bukan ${qty}`);
  }
  return qty;
}

function validateDiscount(discount: Discount) {
  if (discount.type === 'amount') {
    assertRupiah(discount.value, 'diskon');
    if (discount.value < 0) throw new RangeError('diskon tidak boleh negatif');
  } else if (
    !Number.isSafeInteger(discount.value) ||
    discount.value < 0 ||
    discount.value > BPS_PER_100_PERCENT
  ) {
    throw new RangeError(`persen diskon tidak valid: ${discount.value}`);
  }
}

/** Discount in rupiah applied to `base`, never more than `base`. */
export function discountAmountOf(base: Rupiah, discount: Discount | null | undefined): Rupiah {
  if (!discount) return 0;
  validateDiscount(discount);
  const amount = discount.type === 'amount' ? discount.value : percentOf(base, discount.value);
  return Math.min(amount, base);
}

function priceLine(line: PricingLineInput): PricedLine {
  assertRupiah(line.unitPrice, 'harga');
  if (line.unitPrice < 0) throw new RangeError('harga tidak boleh negatif');
  const gross = line.unitPrice * assertQty(line.qty);
  assertRupiah(gross, 'total baris');
  const discountAmount = discountAmountOf(gross, line.discount);
  return { gross, discountAmount, lineTotal: gross - discountAmount };
}

/** Splits service and PB1 out of a tax-inclusive amount so that the parts add up exactly. */
function splitInclusive(
  inclusive: Rupiah,
  serviceBps: Bps,
  pb1Bps: Bps,
): { service: Rupiah; tax: Rupiah } {
  if (serviceBps === 0 && pb1Bps === 0) return { service: 0, tax: 0 };
  const scale = BigInt(BPS_PER_100_PERCENT);
  // inclusive = base * (1 + s) * (1 + p)  =>  base = inclusive * 10000^2 / ((10000+s)(10000+p))
  const numerator = BigInt(inclusive) * scale * scale;
  const denominator = (scale + BigInt(serviceBps)) * (scale + BigInt(pb1Bps));
  let base = numerator / denominator;
  if ((numerator % denominator) * 2n >= denominator) base += 1n;
  const service = percentOf(Number(base), serviceBps);
  return { service, tax: inclusive - Number(base) - service };
}

export function calculateCart(
  lines: PricingLineInput[],
  transactionDiscount: Discount | null | undefined,
  tax: TaxSettings,
): CartTotals {
  const priced = lines.map(priceLine);
  const grossSubtotal = priced.reduce((sum, l) => sum + l.gross, 0);
  const subtotal = priced.reduce((sum, l) => sum + l.lineTotal, 0);
  const transactionDiscountAmount = discountAmountOf(subtotal, transactionDiscount);
  const afterDiscount = subtotal - transactionDiscountAmount;

  let serviceAmount: Rupiah;
  let taxAmount: Rupiah;
  let total: Rupiah;
  if (tax.pricesIncludeTax) {
    const split = splitInclusive(afterDiscount, tax.serviceBps, tax.pb1Bps);
    serviceAmount = split.service;
    taxAmount = split.tax;
    total = afterDiscount;
  } else {
    serviceAmount = percentOf(afterDiscount, tax.serviceBps);
    taxAmount = percentOf(afterDiscount + serviceAmount, tax.pb1Bps);
    total = afterDiscount + serviceAmount + taxAmount;
  }

  return {
    lines: priced,
    grossSubtotal,
    subtotal,
    transactionDiscountAmount,
    totalDiscount: grossSubtotal - afterDiscount,
    serviceAmount,
    taxAmount,
    total: assertRupiah(total, 'total'),
  };
}

/** True when the cart's discounts stay within `limitBps` of the gross subtotal. */
export function isDiscountWithinLimit(totals: CartTotals, limitBps: Bps): boolean {
  if (totals.totalDiscount === 0) return true;
  return (
    BigInt(totals.totalDiscount) * BigInt(BPS_PER_100_PERCENT) <=
    BigInt(totals.grossSubtotal) * BigInt(limitBps)
  );
}
