import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { PosDatabase } from '../db/db';
import { META_DEVICE_ID, META_IS_DEMO, META_STORE_ID } from '../db/seed';
import { META_PRINTER } from '../printing/printer';
import { demoDatabase } from '../test/db';
import {
  countUnsent,
  getCloudLink,
  replaceLocalStore,
  setCloudLink,
  startEmptyStore,
} from './link';

const databases: Dexie[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((d) => d.delete()));
});

describe('device link', () => {
  it('replacing the local store empties the device but keeps its printer', async () => {
    const { database } = await demoDatabase();
    databases.push(database);
    await database.meta.put({ key: META_PRINTER, value: { kind: 'ble', name: 'Putian' } });
    await database.meta.put({ key: 'cartDraft', value: { lines: [] } });
    await setCloudLink(database, { storeId: 'old', role: 'owner', linkedAt: 'x' });

    await replaceLocalStore(database, { storeId: 's2', deviceId: 'd2' });

    expect(await database.products.count()).toBe(0);
    expect(await database.stores.count()).toBe(0);
    expect(await getCloudLink(database)).toBeNull();
    expect((await database.meta.toArray()).map((m) => m.key).sort()).toEqual(
      [META_DEVICE_ID, META_IS_DEMO, META_PRINTER, META_STORE_ID].sort(),
    );
    expect((await database.meta.get(META_STORE_ID))?.value).toBe('s2');
  });

  it('can start over with an empty store whose rows all wait to be sent', async () => {
    const { database } = await demoDatabase();
    databases.push(database);
    const storeId = await startEmptyStore(database, '  Warung Bu Sri ', '2026-10-09T01:00:00.000Z');

    expect((await database.stores.get(storeId))?.name).toBe('Warung Bu Sri');
    expect(await database.products.count()).toBe(0);
    expect((await database.users.toArray()).map((u) => u.role).sort()).toEqual([
      'cashier',
      'owner',
    ]);
    const deviceId = (await database.meta.get(META_DEVICE_ID))?.value as string;
    expect((await database.devices.get(deviceId))?.code).toBe('K1');
    expect(await countUnsent(database)).toEqual({ sales: 0, rows: 4 });
  });
});

describe('database upgrades', () => {
  it('marks every row from before M5 as not yet sent', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ products: 'id, storeId, categoryId', meta: 'key' });
    await v1.table('products').add({ id: 'p1', storeId: 's1', syncedAt: null });
    v1.close();

    const upgraded = new PosDatabase(name);
    databases.push(upgraded);
    expect(await upgraded.products.where('pending').equals(1).primaryKeys()).toEqual(['p1']);
    expect(await upgraded.cashMovements.count()).toBe(0);
  });

  it('adds the cash movements table (v3) and keeps pending marks from v2', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const v2 = new Dexie(name);
    v2.version(2).stores({ shifts: 'id, storeId, deviceId, openedAt, pending', meta: 'key' });
    await v2.table('shifts').add({ id: 's1', storeId: 'st', syncedAt: null, pending: 1 });
    v2.close();

    const upgraded = new PosDatabase(name);
    databases.push(upgraded);
    expect(await upgraded.shifts.where('pending').equals(1).primaryKeys()).toEqual(['s1']);
    await upgraded.cashMovements.add({ id: 'c1', storeId: 'st', shiftId: 's1' } as never);
    expect(await upgraded.cashMovements.where('shiftId').equals('s1').count()).toBe(1);
  });
});
