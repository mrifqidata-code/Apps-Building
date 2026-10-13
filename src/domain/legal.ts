/**
 * Version of docs/syarat-layanan.md and docs/kebijakan-privasi.md. An owner
 * who signs up agrees to this version; it is saved with their account.
 * Change it together with the "Berlaku sejak" line of both documents.
 */
export const TERMS_VERSION = '2026-10-13';

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
];

/** "Berlaku sejak 13 Oktober 2026" for TERMS_VERSION. */
export function termsEffectiveLine(version = TERMS_VERSION): string {
  const [year, month, day] = version.split('-').map(Number);
  return `Berlaku sejak ${day} ${MONTHS[month! - 1]} ${year}`;
}
