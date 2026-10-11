import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatDayLong,
  formatPeriod,
  movePeriod,
  periodContaining,
  periodDays,
  periodFileLabel,
  periodRange,
  weekdayShort,
} from './period';

describe('periods', () => {
  it('finds the day, the Monday–Sunday week and the month of a date', () => {
    // 10 Oct 2026 is a Saturday.
    expect(periodContaining('day', '2026-10-10')).toEqual({
      kind: 'day',
      start: '2026-10-10',
      end: '2026-10-10',
    });
    expect(periodContaining('week', '2026-10-10')).toMatchObject({
      start: '2026-10-05',
      end: '2026-10-11',
    });
    expect(periodContaining('week', '2026-10-05')).toMatchObject({ start: '2026-10-05' });
    expect(periodContaining('week', '2026-10-11')).toMatchObject({ start: '2026-10-05' });
    expect(periodContaining('month', '2026-10-10')).toMatchObject({
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(periodContaining('month', '2028-02-10')).toMatchObject({ end: '2028-02-29' });
  });

  it('moves to the previous and next period', () => {
    const week = periodContaining('week', '2026-10-10');
    expect(movePeriod(week, -1)).toMatchObject({ start: '2026-09-28', end: '2026-10-04' });
    expect(movePeriod(periodContaining('month', '2026-01-15'), -1)).toMatchObject({
      start: '2025-12-01',
      end: '2025-12-31',
    });
    expect(movePeriod(periodContaining('day', '2026-12-31'), 1)).toMatchObject({
      start: '2027-01-01',
    });
  });

  it('lists the days and converts them to UTC bounds in WIB', () => {
    expect(periodDays(periodContaining('week', '2026-10-10'))).toHaveLength(7);
    expect(periodDays(periodContaining('month', '2026-02-01'))).toHaveLength(28);
    expect(periodRange(periodContaining('day', '2026-10-10'))).toEqual([
      '2026-10-09T17:00:00.000Z',
      '2026-10-10T17:00:00.000Z',
    ]);
    expect(periodRange(periodContaining('month', '2026-10-10'))).toEqual([
      '2026-09-30T17:00:00.000Z',
      '2026-10-31T17:00:00.000Z',
    ]);
  });

  it('formats periods in Indonesian', () => {
    expect(formatDayLong('2026-10-10')).toBe('Sabtu, 10 Okt 2026');
    expect(weekdayShort('2026-10-05')).toBe('Sen');
    expect(formatPeriod(periodContaining('day', '2026-10-10'))).toBe('Sabtu, 10 Okt 2026');
    expect(formatPeriod(periodContaining('week', '2026-10-10'))).toBe('5–11 Okt 2026');
    expect(formatPeriod(periodContaining('week', '2026-09-30'))).toBe('28 Sep – 4 Okt 2026');
    expect(formatPeriod(periodContaining('week', '2026-12-31'))).toBe('28 Des 2026 – 3 Jan 2027');
    expect(formatPeriod(periodContaining('month', '2026-08-17'))).toBe('Agustus 2026');
  });

  it('names export files after the period', () => {
    expect(periodFileLabel(periodContaining('day', '2026-10-10'))).toBe('2026-10-10');
    expect(periodFileLabel(periodContaining('week', '2026-10-10'))).toBe('2026-10-05_2026-10-11');
    expect(periodFileLabel(periodContaining('month', '2026-10-10'))).toBe('2026-10');
  });

  it('rejects invalid dates', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => periodContaining('day', '10-10-2026')).toThrow(RangeError);
  });
});
