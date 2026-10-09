import {
  NO_ATTEMPTS,
  hashPin,
  isValidPin,
  lockRemainingMs,
  registerPinFailure,
  verifyPin,
  MAX_PIN_ATTEMPTS,
  type PinAttempts,
} from '../domain/pin';
import type { IsoDateTime } from '../domain/time';
import type { PosDatabase } from './db';
import { newRow, touched } from './rows';
import type { User } from './schema';

/** Who is using this device right now (local only, survives app restarts). */
export const META_ACTIVE_USER = 'activeUserId';
const attemptsKey = (userId: string) => `pinAttempts:${userId}`;

export type PinCheck =
  | { ok: true }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'locked'; retryInMs: number }
  | { ok: false; reason: 'no-pin' | 'inactive' };

export async function setUserPin(
  database: PosDatabase,
  userId: string,
  pin: string,
  now: IsoDateTime,
): Promise<void> {
  if (!isValidPin(pin)) throw new RangeError('PIN harus 4-6 angka.');
  const { hash, salt } = await hashPin(pin);
  await database.transaction('rw', database.users, database.meta, async () => {
    const user = await database.users.get(userId);
    if (!user) throw new Error('Pengguna tidak ditemukan.');
    await database.users.update(userId, { pinHash: hash, pinSalt: salt, ...touched(now) });
    await database.meta.delete(attemptsKey(userId));
  });
}

/** Checks a PIN and records the attempt, locking the user after too many wrong PINs. */
export async function checkPin(
  database: PosDatabase,
  userId: string,
  pin: string,
  nowMs: number = Date.now(),
): Promise<PinCheck> {
  const user = await database.users.get(userId);
  if (!user || !user.active || user.deletedAt) return { ok: false, reason: 'inactive' };
  if (!user.pinHash || !user.pinSalt) return { ok: false, reason: 'no-pin' };

  const attempts =
    ((await database.meta.get(attemptsKey(userId)))?.value as PinAttempts | undefined) ??
    NO_ATTEMPTS;
  const retryInMs = lockRemainingMs(attempts, nowMs);
  if (retryInMs > 0) return { ok: false, reason: 'locked', retryInMs };

  if (await verifyPin(pin, user.pinHash, user.pinSalt)) {
    await database.meta.delete(attemptsKey(userId));
    return { ok: true };
  }
  const next = registerPinFailure(attempts, nowMs);
  await database.meta.put({ key: attemptsKey(userId), value: next });
  const lockedFor = lockRemainingMs(next, nowMs);
  if (lockedFor > 0) return { ok: false, reason: 'locked', retryInMs: lockedFor };
  return { ok: false, reason: 'wrong', attemptsLeft: MAX_PIN_ATTEMPTS - next.failures };
}

export async function signIn(
  database: PosDatabase,
  userId: string,
  pin: string,
  nowMs: number = Date.now(),
): Promise<PinCheck> {
  const result = await checkPin(database, userId, pin, nowMs);
  if (result.ok) await database.meta.put({ key: META_ACTIVE_USER, value: userId });
  return result;
}

export async function signOut(database: PosDatabase): Promise<void> {
  await database.meta.delete(META_ACTIVE_USER);
}

/** Message shown under the PIN pad for a failed check. */
export function pinCheckMessage(result: Exclude<PinCheck, { ok: true }>): string {
  switch (result.reason) {
    case 'wrong':
      return `PIN salah. Sisa ${result.attemptsLeft} percobaan.`;
    case 'locked':
      return `Terlalu banyak PIN salah. Coba lagi dalam ${Math.ceil(result.retryInMs / 1000)} detik.`;
    case 'no-pin':
      return 'PIN belum dibuat.';
    case 'inactive':
      return 'Pengguna ini tidak aktif.';
  }
}

/** Adds a cashier who will create their own PIN on first sign-in. */
export async function addCashier(
  database: PosDatabase,
  storeId: string,
  name: string,
  now: IsoDateTime,
): Promise<string> {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new RangeError('Nama kasir wajib diisi.');
  if (trimmed.length > 40) throw new RangeError('Nama kasir maksimal 40 huruf.');
  const user: User = {
    ...newRow(storeId, now),
    name: trimmed,
    role: 'cashier',
    email: null,
    authUserId: null,
    pinHash: null,
    pinSalt: null,
    active: true,
  };
  await database.users.add(user);
  return user.id;
}
