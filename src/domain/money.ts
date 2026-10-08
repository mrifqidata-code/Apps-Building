/**
 * Money is always an integer number of rupiah. Never store or compute
 * money with fractions; percentages are integer basis points (bps),
 * where 10000 bps = 100% and 1000 bps = 10%.
 */
export type Rupiah = number;
export type Bps = number;

export const BPS_PER_100_PERCENT = 10_000;

export function isRupiah(value: unknown): value is Rupiah {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertRupiah(value: number, label = 'nilai uang'): Rupiah {
  if (!isRupiah(value)) {
    throw new RangeError(`${label} harus bilangan bulat rupiah, bukan ${value}`);
  }
  return value;
}

const thousands = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0, useGrouping: true });

/** Formats 12000 as "Rp12.000" and -5000 as "-Rp5.000". */
export function formatRupiah(value: Rupiah): string {
  assertRupiah(value);
  const sign = value < 0 ? '-' : '';
  return `${sign}Rp${thousands.format(Math.abs(value))}`;
}

/**
 * Parses what a person types into a money field ("12.000", "Rp 12.000",
 * "12000") into rupiah. Returns null when the text is not a whole amount.
 */
export function parseRupiah(text: string): Rupiah | null {
  const cleaned = text.replace(/rp/i, '').replace(/[\s.]/g, '');
  if (!/^-?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

// BigInt keeps intermediate products such as amount * bps exact even
// when they exceed Number.MAX_SAFE_INTEGER.
function divRoundBig(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let quotient = n / d;
  if ((n % d) * 2n >= d) quotient += 1n;
  return negative ? -quotient : quotient;
}

/** Divides two integers and rounds half away from zero, exactly. */
export function divRound(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError('divRound hanya menerima bilangan bulat');
  }
  if (denominator === 0) throw new RangeError('pembagi tidak boleh nol');
  return Number(divRoundBig(BigInt(numerator), BigInt(denominator)));
}

/** Returns `bps` of `amount`, rounded to the nearest rupiah (half away from zero). */
export function percentOf(amount: Rupiah, bps: Bps): Rupiah {
  assertRupiah(amount);
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new RangeError(`persen tidak valid: ${bps}`);
  }
  return Number(divRoundBig(BigInt(amount) * BigInt(bps), BigInt(BPS_PER_100_PERCENT)));
}

/** Converts a percentage typed by a person (e.g. 10 or 12.5) into basis points. */
export function percentToBps(percent: number): Bps {
  const bps = Math.round(percent * 100);
  if (!Number.isFinite(percent) || bps < 0 || bps > BPS_PER_100_PERCENT) {
    throw new RangeError(`persen harus antara 0 dan 100, bukan ${percent}`);
  }
  return bps;
}

/** Formats 1000 bps as "10%" and 1250 bps as "12,5%". */
export function formatBps(bps: Bps): string {
  const percent = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(bps / 100);
  return `${percent}%`;
}
