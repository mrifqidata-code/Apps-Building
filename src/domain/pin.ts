/**
 * Local PIN sign-in. PINs are 4-6 digits, stored only as a salted
 * PBKDF2-SHA256 hash so they can be checked offline on the device.
 *
 * A 4-6 digit PIN cannot resist an offline brute force no matter how it is
 * hashed; the hash keeps PINs from being read back in plain text, and the
 * lockout below slows down guessing on the device itself.
 */
const PIN_PATTERN = /^\d{4,6}$/;
const ITERATIONS = 100_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 60_000;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  if (!isValidPin(pin)) throw new RangeError('PIN harus 4-6 angka');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return { hash: toBase64(await derive(pin, salt)), salt: toBase64(salt) };
}

export async function verifyPin(pin: string, hash: string, salt: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const actual = await derive(pin, fromBase64(salt));
  const expected = fromBase64(hash);
  if (actual.length !== expected.length) return false;
  // Compare every byte so the time taken does not hint at how close a guess was.
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i]! ^ expected[i]!;
  return difference === 0;
}

export interface PinAttempts {
  failures: number;
  /** Epoch ms until which sign-in is blocked; 0 when not locked. */
  lockedUntil: number;
}

export const NO_ATTEMPTS: PinAttempts = { failures: 0, lockedUntil: 0 };

export function lockRemainingMs(state: PinAttempts, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

/** Records a wrong PIN; the 5th wrong PIN in a row locks sign-in for a minute. */
export function registerPinFailure(state: PinAttempts, now: number): PinAttempts {
  const failures = (lockRemainingMs(state, now) > 0 ? 0 : state.failures) + 1;
  if (failures >= MAX_PIN_ATTEMPTS) return { failures: 0, lockedUntil: now + PIN_LOCK_MS };
  return { failures, lockedUntil: 0 };
}
