import type { SupabaseClient } from '@supabase/supabase-js';
import { uuidv7 } from '../domain/id';
import { nowIso } from '../domain/time';
import type { PosDatabase } from '../db/db';
import { META_DEVICE_ID, META_STORE_ID } from '../db/seed';
import { CloudError } from './api';
import { replaceLocalStore, setCloudLink } from './link';
import { SupabaseCloudApi, toCloudError } from './supabase-api';
import { SyncEngine } from './sync-engine';

/** Messages for errors raised by the SQL functions and Supabase Auth. */
const MESSAGES: Record<string, string> = {
  not_signed_in: 'Silakan masuk dengan akun pemilik dulu.',
  owner_account_required: 'Fitur ini perlu akun email pemilik.',
  email_not_confirmed:
    'Email belum dikonfirmasi. Buka email dari Supabase, klik tautan konfirmasi, lalu masuk lagi.',
  store_exists: 'Toko di HP ini sudah terhubung ke sebuah akun.',
  already_owner: 'Akun ini sudah punya toko. Pilih "Pakai toko ini di HP ini".',
  not_owner: 'Hanya pemilik toko yang bisa melakukan ini.',
  store_not_synced: 'Data toko belum terkirim ke cloud. Tunggu sinkron selesai, lalu coba lagi.',
  invalid_code: 'Kode salah atau sudah kedaluwarsa. Minta kode baru ke pemilik.',
  too_many_attempts: 'Terlalu banyak kode salah. Coba lagi 1 jam lagi.',
  already_paired: 'HP ini sudah terhubung ke toko.',
  not_member: 'HP ini sudah diputus oleh pemilik toko.',
  invalid_credentials: 'Email atau password salah.',
  user_already_exists: 'Email ini sudah terdaftar. Silakan masuk.',
  email_exists: 'Email ini sudah terdaftar. Silakan masuk.',
  weak_password: 'Password terlalu lemah. Pakai minimal 8 karakter.',
  over_email_send_rate_limit: 'Terlalu banyak email terkirim. Coba lagi sekitar 1 jam lagi.',
  over_request_rate_limit: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
  anonymous_provider_disabled:
    'Pemasangan HP kasir belum diaktifkan di Supabase (Anonymous sign-ins). Lihat docs/supabase.md.',
  same_password: 'Password baru harus berbeda dari yang lama.',
};

/** Indonesian text for any error from the cloud layer. */
export function cloudErrorMessage(error: unknown): string {
  if (error instanceof CloudError) {
    if (error.kind === 'offline') return 'Tidak ada koneksi internet. Coba lagi saat online.';
    return MESSAGES[error.message] ?? MESSAGES[error.code] ?? error.message;
  }
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: string; message?: string };
    if (code && MESSAGES[code]) return MESSAGES[code];
    if (message && MESSAGES[message]) return MESSAGES[message];
    if (message?.includes('fetch')) return 'Tidak ada koneksi internet. Coba lagi saat online.';
    if (message) return message;
  }
  return String(error);
}

async function rpc<T>(client: SupabaseClient, fn: string, args: object = {}): Promise<T> {
  const { data, error, status } = await client.rpc(fn, args);
  if (error) throw toCloudError(error, status);
  return data as T;
}

/* ---- Owner account (email + password) ---- */

export type SignUpResult = 'signed-in' | 'check-email';

export async function signUpOwner(
  client: SupabaseClient,
  email: string,
  password: string,
  redirectTo: string,
): Promise<SignUpResult> {
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  // Supabase hides whether an email is taken: an existing address comes back without identities.
  if (data.user && data.user.identities?.length === 0) {
    throw new CloudError('rejected', 'user_already_exists', 'user_already_exists');
  }
  return data.session ? 'signed-in' : 'check-email';
}

export async function signInOwner(client: SupabaseClient, email: string, password: string) {
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function sendPasswordReset(client: SupabaseClient, email: string, redirectTo: string) {
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw error;
}

export async function updatePassword(client: SupabaseClient, password: string) {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

/** The signed-in owner's email, or null (also null for a paired cashier phone). */
export async function ownerEmail(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  return user && !user.is_anonymous ? (user.email ?? null) : null;
}

/* ---- Stores and devices ---- */

export interface MyStore {
  store_id: string;
  role: 'owner' | 'device';
  device_id: string | null;
  store_name: string | null;
}

export function myStores(client: SupabaseClient): Promise<MyStore[]> {
  return rpc<MyStore[]>(client, 'my_stores');
}

/** Uploads the store on this device to the signed-in owner's account. */
export async function connectLocalStore(client: SupabaseClient, database: PosDatabase) {
  const storeId = (await database.meta.get(META_STORE_ID))?.value as string;
  await rpc(client, 'create_store', { p_store_id: storeId });
  await setCloudLink(database, { storeId, role: 'owner', linkedAt: nowIso() });
}

/** Uses the owner's existing cloud store on this device (e.g. a new phone). Empties this device first. */
export async function joinStoreAsOwner(
  client: SupabaseClient,
  database: PosDatabase,
  storeId: string,
  deviceName: string,
) {
  const deviceId = uuidv7();
  await rpc(client, 'register_device', {
    p_store_id: storeId,
    p_device_id: deviceId,
    p_name: deviceName,
  });
  await replaceLocalStore(database, { storeId, deviceId });
  await setCloudLink(database, { storeId, role: 'owner', linkedAt: nowIso() });
}

export interface PairingCode {
  code: string;
  expiresAt: string;
}

export async function createPairingCode(
  client: SupabaseClient,
  storeId: string,
): Promise<PairingCode> {
  const data = await rpc<{ code: string; expires_at: string }>(client, 'create_pairing_code', {
    p_store_id: storeId,
  });
  return { code: data.code, expiresAt: new Date(data.expires_at).toISOString() };
}

/** Keeps letters and digits only, upper case: "abcd-efgh" -> "ABCDEFGH". */
export const normalizePairingCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Joins this phone to a store with the owner's pairing code. The phone gets
 * its own anonymous account and its own device code (K2, K3, ...).
 */
export async function pairWithCode(
  client: SupabaseClient,
  database: PosDatabase,
  code: string,
  deviceName: string,
): Promise<{ storeId: string; deviceCode: string; keptLocalData: boolean }> {
  const { data: session } = await client.auth.getSession();
  if (!session.session) {
    const { error } = await client.auth.signInAnonymously();
    if (error) throw error;
  }
  const deviceId = uuidv7();
  const result = await rpc<
    | { ok: true; store_id: string; device_id: string; device_code: string }
    | { ok: false; error: string }
  >(client, 'claim_pairing_code', {
    p_code: normalizePairingCode(code),
    p_device_id: deviceId,
    p_device_name: deviceName,
  });
  if (!result.ok) throw new CloudError('rejected', result.error, result.error);

  // Paired again to the same store (e.g. after the session was lost): keep what is here.
  const localStoreId = (await database.meta.get(META_STORE_ID))?.value;
  const keptLocalData = localStoreId === result.store_id;
  if (keptLocalData) {
    await database.meta.put({ key: META_DEVICE_ID, value: deviceId });
  } else {
    await replaceLocalStore(database, { storeId: result.store_id, deviceId });
  }
  await setCloudLink(database, { storeId: result.store_id, role: 'device', linkedAt: nowIso() });
  return { storeId: result.store_id, deviceCode: result.device_code, keptLocalData };
}

export async function revokeDevice(client: SupabaseClient, deviceId: string) {
  await rpc(client, 'revoke_device', { p_device_id: deviceId });
}

/** Sends and fetches everything once, e.g. right after joining a store. */
export async function firstSync(client: SupabaseClient, database: PosDatabase, storeId: string) {
  await new SyncEngine(database, new SupabaseCloudApi(client), storeId).syncOnce();
}
