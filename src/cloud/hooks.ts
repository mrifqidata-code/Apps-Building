import type { SupabaseClient } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { getCloudClient } from './client';
import { getCloudLink, type CloudLink } from './link';

/** undefined while loading, null when this device is not connected. */
export function useCloudLink(): CloudLink | null | undefined {
  return useLiveQuery(() => getCloudLink(db));
}

export interface CloudAuth {
  client: SupabaseClient;
  /** The signed-in owner's email; null for no session or a paired cashier phone. */
  email: string | null;
  hasSession: boolean;
}

/** The Supabase client and who is signed in on this device. undefined while loading, null without cloud. */
export function useCloudAuth(): CloudAuth | null | undefined {
  const [auth, setAuth] = useState<CloudAuth | null | undefined>(() =>
    getCloudClient() ? undefined : null,
  );

  useEffect(() => {
    const clientPromise = getCloudClient();
    if (!clientPromise) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void clientPromise.then((client) => {
      if (cancelled) return;
      // Fires right away with the current session, then on every sign-in or sign-out.
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        setAuth({
          client,
          hasSession: Boolean(session),
          email: user && !user.is_anonymous ? (user.email ?? null) : null,
        });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return auth;
}
