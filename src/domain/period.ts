import { jakartaDayRange, type IsoDateTime } from './time';

/**
 * Report periods in WIB business days. A week runs Monday to Sunday, the
 * usual convention in Indonesia. Dates are "YYYY-MM-DD" keys, as returned by
 * jakartaDateKey; date arithmetic is done on UTC midnights, so it never
 * depends on the device's time zone.
 */
export type PeriodKind = 'day' | 'week' | 'month';

export interface Period {
  kind: PeriodKind;
  /** First day, inclusive. */
  start: string;
  /** Last day, inclusive. */
  end: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

function parseKey(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError(`tanggal tidak valid: ${dateKey}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== dateKey) {
    throw new RangeError(`tanggal tidak valid: ${dateKey}`);
  }
  return date;
}

const toKey = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(dateKey: string, days: number): string {
  return toKey(new Date(parseKey(dateKey).getTime() + days * DAY_MS));
}

/** The day, week (Monday–Sunday) or month that contains `dateKey`. */
export function periodContaining(kind: PeriodKind, dateKey: string): Period {
  const date = parseKey(dateKey);
  if (kind === 'day') return { kind, start: dateKey, end: dateKey };
  if (kind === 'week') {
    const sinceMonday = (date.getUTCDay() + 6) % 7;
    const start = addDays(dateKey, -sinceMonday);
    return { kind, start, end: addDays(start, 6) };
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    kind,
    start: toKey(new Date(Date.UTC(year, month, 1))),
    end: toKey(new Date(Date.UTC(year, month + 1, 0))),
  };
}

/** The period `steps` periods before (negative) or after (positive) this one. */
export function movePeriod(period: Period, steps: number): Period {
  if (period.kind === 'day') return periodContaining('day', addDays(period.start, steps));
  if (period.kind === 'week') return periodContaining('week', addDays(period.start, steps * 7));
  const start = parseKey(period.start);
  const moved = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + steps, 1));
  return periodContaining('month', toKey(moved));
}

/** Every day of the period, in order. */
export function periodDays(period: Period): string[] {
  const days: string[] = [];
  for (let day = period.start; day <= period.end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** UTC ISO bounds [start, end) of the whole period in WIB. */
export function periodRange(period: Period): [IsoDateTime, IsoDateTime] {
  return [jakartaDayRange(period.start)[0], jakartaDayRange(period.end)[1]];
}

/** "Sabtu, 10 Okt 2026" */
export function formatDayLong(dateKey: string): string {
  const date = parseKey(dateKey);
  return `${WEEKDAYS[date.getUTCDay()]}, ${formatDayShort(dateKey)} ${date.getUTCFullYear()}`;
}

/** "10 Okt" */
export function formatDayShort(dateKey: string): string {
  const date = parseKey(dateKey);
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
}

/** "Sab" */
export function weekdayShort(dateKey: string): string {
  return WEEKDAYS[parseKey(dateKey).getUTCDay()]!.slice(0, 3);
}

/** "Sabtu, 10 Okt 2026", "5–11 Okt 2026", "29 Sep – 5 Okt 2026" or "Oktober 2026". */
export function formatPeriod(period: Period): string {
  const start = parseKey(period.start);
  const end = parseKey(period.end);
  if (period.kind === 'day') return formatDayLong(period.start);
  if (period.kind === 'month') return `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  const year = end.getUTCFullYear();
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${formatDayShort(period.end)} ${year}`;
  }
  const startYear = start.getUTCFullYear() === year ? '' : ` ${start.getUTCFullYear()}`;
  return `${formatDayShort(period.start)}${startYear} – ${formatDayShort(period.end)} ${year}`;
}

/** File-name friendly label: "2026-10-10", "2026-10-05_2026-10-11" or "2026-10". */
export function periodFileLabel(period: Period): string {
  if (period.kind === 'day') return period.start;
  if (period.kind === 'month') return period.start.slice(0, 7);
  return `${period.start}_${period.end}`;
}
