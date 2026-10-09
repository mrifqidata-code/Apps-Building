import { describe, expect, it } from 'vitest';
import { changeFor, suggestCashAmounts } from './cash';

describe('suggestCashAmounts', () => {
  it('rounds the total up to common note combinations', () => {
    expect(suggestCashAmounts(61_000)).toEqual([65_000, 70_000, 80_000, 100_000]);
    expect(suggestCashAmounts(8_000)).toEqual([10_000, 20_000, 50_000, 100_000]);
  });

  it('skips amounts equal to the total, since "Uang pas" covers that', () => {
    expect(suggestCashAmounts(60_000)).toEqual([70_000, 80_000, 100_000]);
    expect(suggestCashAmounts(100_000)).toEqual([110_000, 120_000, 150_000, 200_000]);
    expect(suggestCashAmounts(250_000)).toEqual([260_000, 300_000]);
  });

  it('handles odd totals', () => {
    expect(suggestCashAmounts(12_345)).toEqual([15_000, 20_000, 50_000, 100_000]);
  });

  it('returns nothing for an empty total', () => {
    expect(suggestCashAmounts(0)).toEqual([]);
  });

  it('respects the maximum number of buttons', () => {
    expect(suggestCashAmounts(61_000, 2)).toEqual([65_000, 70_000]);
  });
});

describe('changeFor', () => {
  it('returns the change in whole rupiah', () => {
    expect(changeFor(61_000, 100_000)).toBe(39_000);
    expect(changeFor(61_000, 61_000)).toBe(0);
    expect(changeFor(61_000, 50_000)).toBe(-11_000);
  });
});
