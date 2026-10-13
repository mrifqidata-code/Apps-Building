import type { SupabaseClient } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PosDatabase } from '../db/db';
import type { PlanName, StorePlan } from '../domain/plan';
import type { IsoDateTime } from '../domain/time';
import { toCloudError } from './supabase-api';

/** The store's plan as last read from the server, so it shows offline too. Local only. */
export const META_CLOUD_PLAN = 'cloudPlan';

export interface CachedPlan extends StorePlan {
  checkedAt: IsoDateTime;
}

/**
 * The store's plan, or null when the server has none for it. Throws when the
 * server cannot say (offline, or the M7 SQL is not installed yet).
 */
export async function fetchStorePlan(
  client: SupabaseClient,
  storeId: string,
): Promise<StorePlan | null> {
  const { data, error, status } = await client
    .from('store_plans')
    .select('plan, active_until')
    .eq('store_id', storeId)
    .maybeSingle<{ plan: PlanName; active_until: string | null }>();
  if (error) throw toCloudError(error, status);
  if (!data) return null;
  return {
    plan: data.plan,
    activeUntil: data.active_until === null ? null : new Date(data.active_until).toISOString(),
  };
}

export async function saveCachedPlan(
  database: PosDatabase,
  plan: StorePlan | null,
  checkedAt: IsoDateTime,
): Promise<void> {
  if (!plan) await database.meta.delete(META_CLOUD_PLAN);
  else await database.meta.put({ key: META_CLOUD_PLAN, value: { ...plan, checkedAt } });
}

/** undefined while loading, null when unknown (not connected, or never checked). */
export function useCachedPlan(): CachedPlan | null | undefined {
  return useLiveQuery(
    async () => ((await db.meta.get(META_CLOUD_PLAN))?.value as CachedPlan | undefined) ?? null,
  );
}
