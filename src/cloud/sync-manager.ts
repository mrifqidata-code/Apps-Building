import type { SupabaseClient } from '@supabase/supabase-js';
import { liveQuery, type Subscription } from 'dexie';
import { useSyncExternalStore } from 'react';
import { SYNCED_TABLE_NAMES, db, type PosDatabase } from '../db/db';
import { touched } from '../db/rows';
import { META_DEVICE_ID } from '../db/seed';
import type { SyncedRow } from '../db/schema';
import { nowIso } from '../domain/time';
import { CloudError } from './api';
import { cloudErrorMessage } from './account';
import { getCloudClient } from './client';
import { getCloudLink, type CloudRole } from './link';
import { SupabaseCloudApi } from './supabase-api';
import { META_LAST_SYNC, SyncEngine } from './sync-engine';

/**
 * - off: this device is not connected to the cloud.
 * - idle / syncing: connected and working.
 * - offline: no internet; changes wait on the device.
 * - signed-out: the account session on this device is gone.
 * - revoked: the owner disconnected this device.
 * - error: the last attempt failed; it is retried automatically.
 */
export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'signed-out' | 'revoked' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  role: CloudRole | null;
  /** Rows changed on this device that the server does not have yet. */
  pending: number;
  /** Of those, rows the server refused (see syncError on the row). */
  failed: number;
  lastSyncAt: string | null;
  message: string | null;
  /** Some rows wait because the owner has not pasted the newest SQL file into Supabase. */
  serverOutdated: boolean;
}

const OFF: SyncStatus = {
  phase: 'off',
  role: null,
  pending: 0,
  failed: 0,
  lastSyncAt: null,
  message: null,
  serverOutdated: false,
};

const INTERVAL_MS = 30_000;
const SOON_MS = 1_500;
/** How often a device refreshes its own "last seen" time for the owner's device list. */
const LAST_SEEN_EVERY_MS = 15 * 60_000;

async function countPending(database: PosDatabase) {
  let pending = 0;
  let failed = 0;
  for (const name of SYNCED_TABLE_NAMES) {
    const rows = (await database.table(name).where('pending').equals(1).toArray()) as SyncedRow[];
    pending += rows.length;
    failed += rows.filter((r) => r.syncError).length;
  }
  return { pending, failed };
}

/** Runs sync in the background: after local changes, every 30 s, and when the internet returns. */
export class SyncManager {
  private status: SyncStatus = OFF;
  private readonly listeners = new Set<() => void>();
  private client: SupabaseClient | null = null;
  private engine: SyncEngine | null = null;
  private subscription: Subscription | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private soon: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private runAgain = false;
  private stopAuthListener: (() => void) | null = null;

  constructor(private readonly database: PosDatabase) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getStatus = () => this.status;

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** (Re)reads the link and starts syncing if this device is connected. */
  async start(): Promise<void> {
    this.stop();
    const link = await getCloudLink(this.database);
    const clientPromise = getCloudClient();
    if (!link || !clientPromise) {
      this.status = OFF;
      this.listeners.forEach((l) => l());
      return;
    }
    const client = await clientPromise;
    this.client = client;
    this.engine = new SyncEngine(this.database, new SupabaseCloudApi(client), link.storeId);
    const lastSyncAt =
      ((await this.database.meta.get(META_LAST_SYNC))?.value as string | undefined) ?? null;
    this.set({ ...OFF, phase: 'idle', role: link.role, lastSyncAt });

    this.subscription = liveQuery(() => countPending(this.database)).subscribe({
      next: ({ pending, failed }) => {
        this.set({ pending, failed });
        if (pending > failed) this.requestSoon();
      },
    });
    this.interval = setInterval(() => void this.syncNow(), INTERVAL_MS);
    window.addEventListener('online', this.onWake);
    document.addEventListener('visibilitychange', this.onWake);
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void this.syncNow();
      if (event === 'SIGNED_OUT') this.set({ phase: 'signed-out', message: null });
    });
    this.stopAuthListener = () => data.subscription.unsubscribe();
    void this.syncNow();
  }

  stop() {
    this.subscription?.unsubscribe();
    this.subscription = null;
    if (this.interval) clearInterval(this.interval);
    if (this.soon) clearTimeout(this.soon);
    this.interval = null;
    this.soon = null;
    this.stopAuthListener?.();
    this.stopAuthListener = null;
    window.removeEventListener('online', this.onWake);
    document.removeEventListener('visibilitychange', this.onWake);
    this.engine = null;
  }

  private onWake = () => {
    if (document.visibilityState === 'visible') void this.syncNow();
  };

  private requestSoon() {
    if (this.soon) return;
    this.soon = setTimeout(() => {
      this.soon = null;
      void this.syncNow();
    }, SOON_MS);
  }

  /** Runs one sync now, or right after the one in progress. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.runAgain = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.runAgain) {
        this.runAgain = false;
        void this.syncNow();
      }
    });
    return this.running;
  }

  private async run() {
    const engine = this.engine;
    const client = this.client;
    if (!engine || !client || this.status.phase === 'revoked') return;
    if (!navigator.onLine) return this.set({ phase: 'offline', message: null });
    const { data } = await client.auth.getSession();
    if (!data.session) return this.set({ phase: 'signed-out', message: null });

    this.set({ phase: 'syncing' });
    try {
      await this.refreshLastSeen();
      const report = await engine.syncOnce();
      this.set({
        phase: 'idle',
        lastSyncAt: nowIso(),
        message: null,
        serverOutdated: report.held > 0,
      });
    } catch (e) {
      const kind = e instanceof CloudError ? e.kind : 'offline';
      const phase: SyncPhase =
        kind === 'not-member'
          ? 'revoked'
          : kind === 'signed-out'
            ? 'signed-out'
            : kind === 'offline'
              ? 'offline'
              : 'error';
      this.set({ phase, message: cloudErrorMessage(e) });
      if (phase === 'revoked') this.stop();
    }
  }

  private async refreshLastSeen() {
    const deviceId = (await this.database.meta.get(META_DEVICE_ID))?.value as string | undefined;
    const device = deviceId ? await this.database.devices.get(deviceId) : undefined;
    if (!device) return;
    const last = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
    if (Date.now() - last < LAST_SEEN_EVERY_MS) return;
    const now = nowIso();
    await this.database.devices.update(device.id, { lastSeenAt: now, ...touched(now) });
  }
}

export const syncManager = new SyncManager(db);

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(syncManager.subscribe, syncManager.getStatus);
}
