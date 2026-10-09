import { assertRupiah, type Rupiah } from './money';

// The total rounded up to the next 5.000, plus the next multiple of the
// notes customers usually hand over.
const ROUND_UP_STEP: Rupiah = 5_000;
const NOTE_STEPS: Rupiah[] = [10_000, 20_000, 50_000, 100_000];

/**
 * Quick cash buttons shown next to "Uang pas", e.g.
 * 61.000 -> 65.000, 70.000, 80.000, 100.000 and 60.000 -> 70.000, 80.000, 100.000.
 * Amounts equal to the total are left out because "Uang pas" covers them.
 */
export function suggestCashAmounts(total: Rupiah, max = 4): Rupiah[] {
  assertRupiah(total, 'total');
  if (total <= 0) return [];
  const amounts = new Set<Rupiah>();
  const roundedUp = Math.ceil(total / ROUND_UP_STEP) * ROUND_UP_STEP;
  if (roundedUp > total) amounts.add(roundedUp);
  for (const step of NOTE_STEPS) amounts.add((Math.floor(total / step) + 1) * step);
  return [...amounts].sort((a, b) => a - b).slice(0, max);
}

export function changeFor(total: Rupiah, paid: Rupiah): Rupiah {
  assertRupiah(total, 'total');
  assertRupiah(paid, 'uang diterima');
  return paid - total;
}
