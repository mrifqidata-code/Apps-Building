import { describe, expect, it } from 'vitest';
import {
  JAKARTA_TIME_ZONE,
  formatJakartaDateTime,
  jakartaCompactDate,
  jakartaDateKey,
  jakartaParts,
} from './time';

describe('Jakarta time', () => {
  it('rolls over to the next business day at midnight WIB, not UTC', () => {
    // 16:59 UTC = 23:59 WIB, 17:00 UTC = 00:00 WIB the next day
    expect(jakartaDateKey('2026-10-08T16:59:59.999Z')).toBe('2026-10-08');
    expect(jakartaDateKey('2026-10-08T17:00:00.000Z')).toBe('2026-10-09');
  });

  it('handles year boundaries', () => {
    expect(jakartaDateKey('2026-12-31T17:30:00.000Z')).toBe('2027-01-01');
    expect(jakartaCompactDate('2026-12-31T17:30:00.000Z')).toBe('270101');
  });

  it('formats date and time for receipts', () => {
    expect(formatJakartaDateTime('2026-10-08T07:30:00.000Z')).toBe('8 Okt 2026 14.30');
    expect(formatJakartaDateTime('2026-05-01T00:05:00.000Z')).toBe('1 Mei 2026 07.05');
  });

  it('matches the IANA Asia/Jakarta zone', () => {
    const samples = [
      '2024-02-29T16:00:00.000Z',
      '2026-06-15T23:45:00.000Z',
      '2030-01-01T00:00:00Z',
    ];
    const intl = new Intl.DateTimeFormat('en-GB', {
      timeZone: JAKARTA_TIME_ZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    for (const iso of samples) {
      const parts = Object.fromEntries(
        intl.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
      );
      expect(jakartaParts(iso)).toEqual({
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
      });
    }
  });

  it('rejects invalid timestamps', () => {
    expect(() => jakartaDateKey('bukan tanggal')).toThrow(RangeError);
  });
});
