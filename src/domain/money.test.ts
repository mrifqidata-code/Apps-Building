import { describe, expect, it } from 'vitest';
import {
  allocateProportionally,
  assertRupiah,
  divRound,
  formatBps,
  formatRupiah,
  parseRupiah,
  percentOf,
  percentToBps,
  ratioBps,
} from './money';

describe('formatRupiah', () => {
  it('formats with dot thousand separators and no space after Rp', () => {
    expect(formatRupiah(12_000)).toBe('Rp12.000');
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatRupiah(500)).toBe('Rp500');
    expect(formatRupiah(1_250_000)).toBe('Rp1.250.000');
  });

  it('puts the minus sign before Rp', () => {
    expect(formatRupiah(-5_000)).toBe('-Rp5.000');
  });

  it('rejects fractional amounts', () => {
    expect(() => formatRupiah(12_000.5)).toThrow(RangeError);
  });
});

describe('assertRupiah', () => {
  it('accepts safe integers and rejects everything else', () => {
    expect(assertRupiah(10)).toBe(10);
    expect(() => assertRupiah(0.1 + 0.2)).toThrow(RangeError);
    expect(() => assertRupiah(Number.NaN)).toThrow(RangeError);
    expect(() => assertRupiah(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});

describe('parseRupiah', () => {
  it('reads amounts the way people type them', () => {
    expect(parseRupiah('12.000')).toBe(12_000);
    expect(parseRupiah('Rp 12.000')).toBe(12_000);
    expect(parseRupiah('rp50000')).toBe(50_000);
    expect(parseRupiah(' 7500 ')).toBe(7_500);
  });

  it('returns null for text that is not a whole amount', () => {
    expect(parseRupiah('')).toBeNull();
    expect(parseRupiah('12,5')).toBeNull();
    expect(parseRupiah('abc')).toBeNull();
  });
});

describe('divRound', () => {
  it('rounds half away from zero', () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(4, 3)).toBe(1);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(5, -2)).toBe(-3);
  });

  it('refuses to divide by zero', () => {
    expect(() => divRound(1, 0)).toThrow(RangeError);
  });
});

describe('percentOf', () => {
  it('computes percentages in whole rupiah', () => {
    expect(percentOf(25_000, 1_000)).toBe(2_500); // 10%
    expect(percentOf(23_000, 1_250)).toBe(2_875); // 12.5%
    expect(percentOf(12_345, 1_000)).toBe(1_235); // 1234.5 rounds up
    expect(percentOf(12_344, 1_000)).toBe(1_234);
  });

  it('stays exact when amount * bps exceeds the safe integer range', () => {
    expect(percentOf(900_000_000_000_001, 10_000)).toBe(900_000_000_000_001);
  });
});

describe('percent helpers', () => {
  it('converts typed percentages to basis points', () => {
    expect(percentToBps(10)).toBe(1_000);
    expect(percentToBps(12.5)).toBe(1_250);
    expect(() => percentToBps(101)).toThrow(RangeError);
    expect(() => percentToBps(-1)).toThrow(RangeError);
  });

  it('formats basis points the Indonesian way', () => {
    expect(formatBps(1_000)).toBe('10%');
    expect(formatBps(1_250)).toBe('12,5%');
  });
});

describe('allocateProportionally', () => {
  it('splits in proportion and always adds up to the total', () => {
    expect(allocateProportionally(10_000, [1, 1])).toEqual([5_000, 5_000]);
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(9_000, [20_000, 10_000])).toEqual([6_000, 3_000]);
  });

  it('gives leftover rupiah to the largest remainders, ties to the earlier part', () => {
    // 11 over 3:3:4 is 3.3, 3.3, 4.4: floors 3, 3, 4, and the leftover goes to the .4.
    expect(allocateProportionally(11, [3, 3, 4])).toEqual([3, 3, 5]);
    expect(allocateProportionally(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });

  it('handles zero totals and zero weights', () => {
    expect(allocateProportionally(0, [5, 7])).toEqual([0, 0]);
    expect(allocateProportionally(0, [])).toEqual([]);
    expect(allocateProportionally(500, [0, 0])).toEqual([500, 0]);
    expect(allocateProportionally(500, [0, 3])).toEqual([0, 500]);
  });

  it('stays exact with large amounts', () => {
    const parts = allocateProportionally(999_999_999_999, [333_333_333_333, 666_666_666_667]);
    expect(parts[0]! + parts[1]!).toBe(999_999_999_999);
  });

  it('rejects negative or fractional input', () => {
    expect(() => allocateProportionally(-1, [1])).toThrow(RangeError);
    expect(() => allocateProportionally(10, [1.5])).toThrow(RangeError);
    expect(() => allocateProportionally(10, [-1, 2])).toThrow(RangeError);
    expect(() => allocateProportionally(10, [])).toThrow(RangeError);
  });
});

describe('ratioBps', () => {
  it('returns basis points rounded half away from zero', () => {
    expect(ratioBps(1, 3)).toBe(3_333);
    expect(ratioBps(2, 3)).toBe(6_667);
    expect(ratioBps(-1, 8)).toBe(-1_250);
    expect(ratioBps(5_000, 10_000)).toBe(5_000);
  });

  it('is null without a positive whole', () => {
    expect(ratioBps(5, 0)).toBeNull();
    expect(ratioBps(5, -10)).toBeNull();
  });
});
