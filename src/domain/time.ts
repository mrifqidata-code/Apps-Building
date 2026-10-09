/**
 * Timestamps are stored as UTC ISO strings (Date#toISOString). Everything
 * shown to people or grouped into business days uses Asia/Jakarta (WIB).
 *
 * WIB has been a fixed UTC+7 with no daylight saving since 1964, so we
 * shift by a constant offset instead of depending on the device's ICU
 * time zone data, which keeps receipts and reports identical everywhere.
 */
export const JAKARTA_TIME_ZONE = 'Asia/Jakarta';
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

export type IsoDateTime = string;

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

export interface JakartaParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function nowIso(): IsoDateTime {
  return new Date().toISOString();
}

function toDate(value: Date | IsoDateTime): Date {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError(`waktu tidak valid: ${String(value)}`);
  return date;
}

export function jakartaParts(value: Date | IsoDateTime): JakartaParts {
  const shifted = new Date(toDate(value).getTime() + JAKARTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Business-day key in WIB, e.g. "2026-10-08". */
export function jakartaDateKey(value: Date | IsoDateTime): string {
  const { year, month, day } = jakartaParts(value);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Compact WIB date for receipt numbers, e.g. "261008". */
export function jakartaCompactDate(value: Date | IsoDateTime): string {
  const { year, month, day } = jakartaParts(value);
  return `${pad2(year % 100)}${pad2(month)}${pad2(day)}`;
}

/** e.g. "8 Okt 2026 14.30" — the Indonesian convention uses a dot in times. */
export function formatJakartaDateTime(value: Date | IsoDateTime): string {
  const { year, month, day, hour, minute } = jakartaParts(value);
  return `${day} ${MONTHS_SHORT[month - 1]} ${year} ${pad2(hour)}.${pad2(minute)}`;
}

/** UTC ISO bounds [start, end) of a WIB business day such as "2026-10-08". */
export function jakartaDayRange(dateKey: string): [IsoDateTime, IsoDateTime] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError(`tanggal tidak valid: ${dateKey}`);
  const startMs =
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - JAKARTA_OFFSET_MS;
  const dayMs = 24 * 60 * 60 * 1000;
  return [new Date(startMs).toISOString(), new Date(startMs + dayMs).toISOString()];
}
