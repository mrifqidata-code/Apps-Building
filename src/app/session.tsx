import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { META_ACTIVE_USER } from '../db/auth';
import { db } from '../db/db';
import { META_DEVICE_ID } from '../db/seed';
import { SessionContext } from './session-context';

export function SessionProvider({ storeId, children }: { storeId: string; children: ReactNode }) {
  const session = useLiveQuery(async () => {
    const [store, deviceMeta, userMeta] = await Promise.all([
      db.stores.get(storeId),
      db.meta.get(META_DEVICE_ID),
      db.meta.get(META_ACTIVE_USER),
    ]);
    const device = deviceMeta ? await db.devices.get(deviceMeta.value as string) : undefined;
    if (!store || !device) return null;
    const candidate = userMeta ? await db.users.get(userMeta.value as string) : undefined;
    const user =
      candidate && candidate.active && !candidate.deletedAt && candidate.storeId === store.id
        ? candidate
        : null;
    return { store, device, user, isOwner: user?.role === 'owner' };
  }, [storeId]);

  if (session === undefined) return <main className="p-6 text-slate-500">Memuat…</main>;
  if (session === null) {
    return (
      <main className="p-6">
        <h1 className="text-lg font-bold">Data toko di perangkat ini tidak lengkap</h1>
      </main>
    );
  }
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
