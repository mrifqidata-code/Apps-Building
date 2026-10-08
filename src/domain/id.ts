/**
 * UUIDv7 (RFC 9562): 48-bit Unix milliseconds followed by random bits.
 * Every row gets its id on the device that creates it, so ids work offline,
 * double as the `client_uuid` the server deduplicates on, and sort roughly
 * by creation time, which keeps database indexes compact.
 */
export function uuidv7(
  nowMs: number = Date.now(),
  random: Uint8Array = crypto.getRandomValues(new Uint8Array(10)),
): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError('waktu tidak valid');
  if (random.length !== 10) throw new RangeError('butuh 10 byte acak');

  const bytes = new Uint8Array(16);
  let ts = nowMs;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes.set(random, 6);
  bytes[6] = 0x70 | (bytes[6]! & 0x0f); // version 7
  bytes[8] = 0x80 | (bytes[8]! & 0x3f); // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Milliseconds encoded in a UUIDv7. */
export function uuidv7Timestamp(id: string): number {
  if (!isUuid(id)) throw new RangeError(`bukan UUID: ${id}`);
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
