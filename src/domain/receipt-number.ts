import { jakartaCompactDate, type IsoDateTime } from './time';

/**
 * Receipt numbers are safe to create offline because each device numbers
 * its own receipts: DEVICE-YYMMDD-SEQUENCE, e.g. "K1-261008-0007".
 * The sequence restarts every WIB day and is unique per device, and device
 * codes are unique per store, so two devices can never collide.
 */
const DEVICE_CODE_PATTERN = /^[A-Z][A-Z0-9]{0,3}$/;

export function isValidDeviceCode(code: string): boolean {
  return DEVICE_CODE_PATTERN.test(code);
}

export function formatReceiptNumber(
  deviceCode: string,
  at: Date | IsoDateTime,
  sequence: number,
): string {
  if (!isValidDeviceCode(deviceCode)) {
    throw new RangeError(`kode perangkat tidak valid: ${deviceCode}`);
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(`urutan struk tidak valid: ${sequence}`);
  }
  return `${deviceCode}-${jakartaCompactDate(at)}-${String(sequence).padStart(4, '0')}`;
}

/** Key for the per-device, per-day counter that feeds `sequence`. */
export function receiptCounterKey(deviceCode: string, at: Date | IsoDateTime): string {
  return `receipt:${deviceCode}:${jakartaCompactDate(at)}`;
}
