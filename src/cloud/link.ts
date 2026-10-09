import { uuidv7 } from '../domain/id';
import type { IsoDateTime } from '../domain/time';
import { META_PRINTER } from '../printing/printer';
import { SYNCED_TABLE_NAMES, type PosDatabase } from '../db/db';
import { newRow } from '../db/rows';
import type { Device, Store, User } from '../db/schema';
import { META_DEVICE_ID, META_IS_DEMO, META_STORE_ID } from '../db/seed';

/** Which cloud store this device syncs with, and as whom. Local only. */
export const META_CLOUD_LINK = 'cloudLink';

/**
 * - owner: signed in with the owner's email account.
 * - device: a cashier phone paired with a code from the owner.
 */
export type CloudRole = 'owner' | 'device';

export interface CloudLink {
  storeId: string;
  role: CloudRole;
  linkedAt: IsoDateTime;
}

export async function getCloudLink(database: PosDatabase): Promise<CloudLink | null> {
  return ((await database.meta.get(META_CLOUD_LINK))?.value as CloudLink | undefined) ?? null;
}

export async function setCloudLink(database: PosDatabase, link: CloudLink): Promise<void> {
  await database.meta.put({ key: META_CLOUD_LINK, value: link });
}

/** Meta entries that belong to the phone, not to a store, and survive switching stores. */
const DEVICE_META = new Set([META_PRINTER]);

/**
 * Empties this device and points it at another store and device row. The
 * store's data then arrives with the next pull. Printer settings are kept.
 */
export async function replaceLocalStore(
  database: PosDatabase,
  target: { storeId: string; deviceId: string },
): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    for (const table of database.tables) {
      if (table.name !== 'meta') await table.clear();
    }
    const keep = await database.meta.filter((m) => DEVICE_META.has(m.key)).toArray();
    await database.meta.clear();
    await database.meta.bulkPut([
      ...keep,
      { key: META_STORE_ID, value: target.storeId },
      { key: META_DEVICE_ID, value: target.deviceId },
      { key: META_IS_DEMO, value: false },
    ]);
  });
}

/**
 * Replaces the demo data with an empty store (owner, one cashier, this
 * device as K1, no products), for an owner who wants to start clean.
 */
export async function startEmptyStore(
  database: PosDatabase,
  storeName: string,
  now: IsoDateTime,
): Promise<string> {
  const storeId = uuidv7();
  const device: Device = {
    ...newRow(storeId, now),
    name: 'Kasir 1',
    code: 'K1',
    active: true,
    lastSeenAt: null,
  };
  await replaceLocalStore(database, { storeId, deviceId: device.id });
  const store: Store = {
    ...newRow(storeId, now),
    id: storeId,
    name: storeName.trim() || 'Toko Saya',
    address: '',
    phone: '',
    logoImageId: null,
    receiptFooter: 'Terima kasih!',
    pricesIncludeTax: false,
    pb1Bps: 0,
    serviceBps: 0,
    qrisImageId: null,
    cashierMaxDiscountBps: 0,
  };
  const user = (name: string, role: User['role']): User => ({
    ...newRow(storeId, now),
    name,
    role,
    email: null,
    authUserId: null,
    pinHash: null,
    pinSalt: null,
    active: true,
  });
  await database.transaction('rw', database.stores, database.users, database.devices, async () => {
    await database.stores.add(store);
    await database.users.bulkAdd([user('Pemilik', 'owner'), user('Kasir', 'cashier')]);
    await database.devices.add(device);
  });
  return storeId;
}

/** Rows on this device that the server does not have yet (lost if the device is emptied). */
export async function countUnsent(database: PosDatabase): Promise<{ sales: number; rows: number }> {
  let rows = 0;
  for (const name of SYNCED_TABLE_NAMES) {
    rows += await database.table(name).where('pending').equals(1).count();
  }
  const sales = await database.transactions.where('pending').equals(1).count();
  return { sales, rows };
}
