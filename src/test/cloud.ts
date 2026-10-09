import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { connectLocalStore } from '../cloud/account';
import { SupabaseCloudApi } from '../cloud/supabase-api';
import { SyncEngine } from '../cloud/sync-engine';
import type { PosDatabase } from '../db/db';
import { demoDatabase } from './db';

declare const process: { env: Record<string, string | undefined> };

/**
 * Local Supabase from `npm run db:start`. The defaults are the fixed keys the
 * Supabase CLI uses for every local stack (not secret, never used in production).
 */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export function newClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** A new owner account (email confirmation is off in the local config). */
export async function ownerClient(): Promise<SupabaseClient> {
  const client = newClient();
  const { error } = await client.auth.signUp({
    email: `pemilik-${crypto.randomUUID()}@contoh.test`,
    password: 'rahasia-123',
  });
  if (error) throw error;
  return client;
}

export async function anonymousClient(): Promise<SupabaseClient> {
  const client = newClient();
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return client;
}

export const engineFor = (database: PosDatabase, client: SupabaseClient, storeId: string) =>
  new SyncEngine(database, new SupabaseCloudApi(client), storeId);

/** An owner's phone with the demo store uploaded to the cloud. */
export async function connectedOwnerDevice() {
  const demo = await demoDatabase();
  const client = await ownerClient();
  await connectLocalStore(client, demo.database);
  const engine = engineFor(demo.database, client, demo.storeId);
  await engine.syncOnce();
  return { ...demo, client, engine };
}
