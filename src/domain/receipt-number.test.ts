import { describe, expect, it } from 'vitest';
import { formatReceiptNumber, isValidDeviceCode, receiptCounterKey } from './receipt-number';

describe('formatReceiptNumber', () => {
  it('combines device code, WIB date and a zero-padded sequence', () => {
    expect(formatReceiptNumber('K1', '2026-10-08T07:00:00.000Z', 7)).toBe('K1-261008-0007');
  });

  it('uses the WIB date, so 23:30 UTC belongs to the next day', () => {
    expect(formatReceiptNumber('K2', '2026-10-08T23:30:00.000Z', 1)).toBe('K2-261009-0001');
  });

  it('keeps counting past 9999 without truncating', () => {
    expect(formatReceiptNumber('K1', '2026-10-08T07:00:00.000Z', 12_345)).toBe('K1-261008-12345');
  });

  it('rejects invalid device codes and sequences', () => {
    expect(() => formatReceiptNumber('k1', '2026-10-08T07:00:00.000Z', 1)).toThrow(RangeError);
    expect(() => formatReceiptNumber('K1', '2026-10-08T07:00:00.000Z', 0)).toThrow(RangeError);
    expect(() => formatReceiptNumber('K1', '2026-10-08T07:00:00.000Z', 1.5)).toThrow(RangeError);
  });
});

describe('device codes', () => {
  it('accepts short uppercase codes starting with a letter', () => {
    expect(isValidDeviceCode('K1')).toBe(true);
    expect(isValidDeviceCode('KSR2')).toBe(true);
    expect(isValidDeviceCode('1K')).toBe(false);
    expect(isValidDeviceCode('K-1')).toBe(false);
    expect(isValidDeviceCode('KASIR')).toBe(false);
  });
});

describe('receiptCounterKey', () => {
  it('is scoped to device and WIB day', () => {
    expect(receiptCounterKey('K1', '2026-10-08T07:00:00.000Z')).toBe('receipt:K1:261008');
  });
});
