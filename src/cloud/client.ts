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

/**
 * Forgets the account session on this device only; the account's other
 * devices stay signed in. Works offline too: supabase-js keeps the session
 * when it cannot reach the server, so the stored session is removed as well.
 */
export async function forgetCloudSession(): Promise<void> {
  const clientPromise = getCloudClient();
  if (clientPromise) {
    try {
      await (await clientPromise).auth.signOut({ scope: 'local' });
    } catch {
      // Offline or already signed out: the stored session goes below.
    }
  }
  for (const key of Object.keys(localStorage)) {
    if (/^sb-.+-auth-token/.test(key)) localStorage.removeItem(key);
  }
}
