/**
 * UUIDv7 (RFC 9562): 48-bit Unix milliseconds followed by 74 random bits.
 * Every row gets its id on the device that creates it, so ids work offline,
 * double as the `client_uuid` the server deduplicates on, and sort by
 * creation time, which keeps database indexes compact.
 *
 * Ids created within the same millisecond increment the random part
 * (RFC 9562 section 6.2), so sorting by id always matches creation order,
 * e.g. the items of one sale keep the order they were added in.
 */
const RAND_BITS = 74n;
const MAX_RAND = (1n << RAND_BITS) - 1n;
const RAND_B_BITS = 62n;

let lastMs = -1;
let lastRand = 0n;

function randomBits(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value >> 6n; // 80 random bits -> 74
}

/** Encodes a timestamp and 74 random bits as a version 7 UUID string. */
export function encodeUuidv7(ms: number, rand: bigint): string {
  if (!Number.isSafeInteger(ms) || ms < 0 || ms >= 2 ** 48)
    throw new RangeError('waktu tidak valid');
  if (rand < 0n || rand > MAX_RAND) throw new RangeError('bit acak tidak valid');

  const bytes = new Uint8Array(16);
  let ts = ms;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  const randA = Number(rand >> RAND_B_BITS); // 12 bits
  let randB = rand & ((1n << RAND_B_BITS) - 1n); // 62 bits
  bytes[6] = 0x70 | (randA >> 8); // version 7
  bytes[7] = randA & 0xff;
  for (let i = 15; i >= 9; i--) {
    bytes[i] = Number(randB & 0xffn);
    randB >>= 8n;
  }
  bytes[8] = 0x80 | Number(randB & 0x3fn); // RFC variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidv7(nowMs: number = Date.now()): string {
  let ms = nowMs;
  let rand: bigint;
  if (ms <= lastMs) {
    // Same millisecond, or the clock moved back: keep counting from the last id.
    ms = lastMs;
    rand = lastRand + 1n;
    if (rand > MAX_RAND) {
      ms += 1;
      rand = randomBits();
    }
  } else {
    rand = randomBits();
  }
  lastMs = ms;
  lastRand = rand;
  return encodeUuidv7(ms, rand);
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
