import { jakartaDateKey, jakartaParts, type IsoDateTime } from './time';

/**
 * CSV for Google Sheets (and Excel): comma separated, quoted when needed,
 * CRLF line ends, UTF-8. Money stays a plain whole number (15000, no "Rp" or
 * dots) and no cell has decimals, so every spreadsheet locale reads the
 * numbers the same way.
 */
export type CsvCell = string | number | null | undefined;

/** UTF-8 byte order mark, so Excel reads the file as UTF-8 too; Sheets skips it. */
export const CSV_BOM = '\uFEFF';

/** Text starting like this would run as a formula when the file is opened (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new RangeError(`angka CSV harus bilangan bulat: ${value}`);
    return String(value);
  }
  let text = value;
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** WIB date "2026-10-10" (Sheets reads it as a date in any locale). */
export const csvDate = (at: IsoDateTime) => jakartaDateKey(at);

/** WIB time "14:05". */
export function csvTime(at: IsoDateTime): string {
  const { hour, minute } = jakartaParts(at);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** WIB "2026-10-10 14:05". */
export const csvDateTime = (at: IsoDateTime) => `${csvDate(at)} ${csvTime(at)}`;
