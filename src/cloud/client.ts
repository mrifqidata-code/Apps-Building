import type { SupabaseClient } from '@supabase/supabase-js';

export interface CloudConfig {
  url: string;
  publishableKey: string;
}

/** Set at build time (see docs/supabase.md). Without it the app runs on this device only. */
export function cloudConfig(): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && publishableKey ? { url, publishableKey } : null;
}

export const isCloudConfigured = () => cloudConfig() !== null;

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * The Supabase client, loaded on first use so the cashier screen does not
 * wait for it. The session is kept in localStorage and refreshed automatically.
 */
export function getCloudClient(): Promise<SupabaseClient> | null {
  const config = cloudConfig();
  if (!config) return null;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return clientPromise;
}
