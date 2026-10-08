import { describe, expect, it } from 'vitest';
import {
  assertRupiah,
  divRound,
  formatBps,
  formatRupiah,
  parseRupiah,
  percentOf,
  percentToBps,
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
