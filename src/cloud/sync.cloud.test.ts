import { describe, expect, it } from 'vitest';
import { EMPTY_CART, cartReducer, type Cart } from '../db/cart';
import { saveImage } from '../db/images';
import { completeSale } from '../db/checkout';
import { PosDatabase } from '../db/db';
import { touched } from '../db/rows';
import { addCashMovement, closeShift, openShift } from '../db/shift';
import { META_DEVICE_ID, META_STORE_ID } from '../db/seed';
import { anonymousClient, connectedOwnerDevice, engineFor } from '../test/cloud';
import { createPairingCode, pairWithCode } from './account';
import { getCloudLink } from './link';

const add = (cart: Cart, productId: string) => cartReducer(cart, { type: 'add', productId });

/** The owner's phone (K1) plus a cashier phone (K2) paired with a code. */
async function twoDevices() {
  const owner = await connectedOwnerDevice();
  const { code } = await createPairingCode(owner.client, owner.storeId);

  const phoneDb = new PosDatabase(`test-${crypto.randomUUID()}`);
  const phoneClient = await anonymousClient();
  const paired = await pairWithCode(phoneClient, phoneDb, code, 'Kasir depan');
  const phone = engineFor(phoneDb, phoneClient, paired.storeId);
  await phone.syncOnce();
  const phoneDeviceId = (await phoneDb.meta.get(META_DEVICE_ID))!.value as string;

  const sell = async (database: PosDatabase, deviceId: string, names: string[], now: string) => {
    // Opens the drawer on the first sale (later calls get the open shift back).
    await openShift(database, {
      storeId: owner.storeId,
      deviceId,
      userId: owner.cashier.id,
      openingCash: 100_000,
      now,
    });
    return completeSale(database, {
      storeId: owner.storeId,
      deviceId,
      cashier: { id: owner.cashier.id, role: 'cashier' },
      cart: names.reduce((cart, name) => add(cart, owner.product(name).id), EMPTY_CART),
      paymentMethod: 'cash',
      amountPaid: 200_000,
      now,
    });
  };
  return { owner, phoneDb, phone, phoneDeviceId, paired, sell };
}

describe('Sinkron dua perangkat (Supabase lokal)', () => {
  it('a paired phone receives the whole store and its own device code', async () => {
    const { owner, phoneDb, paired } = await twoDevices();
    expect(paired).toEqual({ storeId: owner.storeId, deviceCode: 'K2', keptLocalData: false });
    expect(await phoneDb.meta.get(META_STORE_ID)).toEqual({
      key: META_STORE_ID,
      value: owner.storeId,
    });
    expect(await getCloudLink(phoneDb)).toMatchObject({ storeId: owner.storeId, role: 'device' });

    expect(await phoneDb.products.count()).toBe(15);
    expect(await phoneDb.productVariants.count()).toBe(
      await owner.database.productVariants.count(),
    );
    expect((await phoneDb.users.toArray()).map((u) => u.name).sort()).toEqual(['Kasir', 'Pemilik']);
    expect((await phoneDb.devices.toArray()).map((d) => d.code).sort()).toEqual(['K1', 'K2']);
    // Nothing the phone received is waiting to be sent back.
    expect(await phoneDb.products.where('pending').equals(1).count()).toBe(0);
  });

  it('sales made offline on both phones end up on both, exactly once', async () => {
    const { owner, phoneDb, phone, phoneDeviceId, sell } = await twoDevices();
    // Offline: each phone sells on its own.
    await sell(
      owner.database,
      owner.deviceId,
      ['Espresso', 'Croissant Butter'],
      '2026-10-09T03:00:00.000Z',
    );
    await sell(owner.database, owner.deviceId, ['Americano'], '2026-10-09T03:05:00.000Z');
    await sell(
      phoneDb,
      phoneDeviceId,
      ['Croissant Butter', 'Teh Tarik'],
      '2026-10-09T03:01:00.000Z',
    );
    await sell(phoneDb, phoneDeviceId, ['Es Teh Manis'], '2026-10-09T03:02:00.000Z');
    await sell(phoneDb, phoneDeviceId, ['Croissant Butter'], '2026-10-09T03:03:00.000Z');

    // Back online, in any order and as often as the app likes.
    for (const engine of [owner.engine, phone, owner.engine, phone, phone, owner.engine]) {
      await engine.syncOnce();
    }

    for (const database of [owner.database, phoneDb]) {
      const receipts = (await database.transactions.toArray()).map((t) => t.receiptNo).sort();
      expect(receipts).toEqual([
        'K1-261009-0001',
        'K1-261009-0002',
        'K2-261009-0001',
        'K2-261009-0002',
        'K2-261009-0003',
      ]);
      expect(await database.transactionItems.count()).toBe(7);
      // Stock is the sum of movements: 3 croissants sold across both phones.
      const croissant = owner.product('Croissant Butter').id;
      const movements = await database.stockMovements.where({ productId: croissant }).toArray();
      expect(movements.reduce((sum, m) => sum + m.qtyDelta, 0)).toBe(-3);
    }
    const { count } = await owner.client
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', owner.storeId);
    expect(count).toBe(5);
    expect(await owner.database.transactions.where('pending').equals(1).count()).toBe(0);
    expect(await phoneDb.transactions.where('pending').equals(1).count()).toBe(0);
  });

  it('a closed shift and its kas masuk/keluar reach the owner', async () => {
    const { owner, phoneDb, phone, phoneDeviceId, sell } = await twoDevices();
    await sell(phoneDb, phoneDeviceId, ['Espresso', 'Americano'], '2026-10-09T03:00:00.000Z');
    const shift = (await phoneDb.shifts.toArray())[0]!;
    await addCashMovement(phoneDb, {
      storeId: owner.storeId,
      deviceId: phoneDeviceId,
      userId: owner.cashier.id,
      type: 'out',
      amount: 12_000,
      reason: 'Beli es batu',
      now: '2026-10-09T04:00:00.000Z',
    });
    await phone.syncOnce();
    await closeShift(phoneDb, {
      shiftId: shift.id,
      userId: owner.cashier.id,
      countedCash: 120_000,
      note: '',
      now: '2026-10-09T10:00:00.000Z',
    });
    await phone.syncOnce();
    await owner.engine.syncOnce();

    // 100.000 + 33.000 - 12.000 = 121.000 expected, 120.000 counted
    expect(await owner.database.shifts.get(shift.id)).toMatchObject({
      closedAt: '2026-10-09T10:00:00.000Z',
      expectedCash: 121_000,
      countedCash: 120_000,
      cashDifference: -1_000,
    });
    expect(await owner.database.cashMovements.toArray()).toMatchObject([
      { shiftId: shift.id, type: 'out', amount: 12_000, reason: 'Beli es batu' },
    ]);
    expect(await phoneDb.cashMovements.where('pending').equals(1).count()).toBe(0);
    const sale = (await owner.database.transactions.toArray())[0]!;
    expect(sale.shiftId).toBe(shift.id);
  });

  it('master data: the latest edit wins on every phone, whichever syncs first', async () => {
    const { owner, phoneDb, phone } = await twoDevices();
    const espresso = owner.product('Espresso').id;

    // The phone edits earlier but syncs later; the owner's later edit must survive.
    await phoneDb.products.update(espresso, {
      price: 16_000,
      ...touched('2026-10-09T04:00:00.000Z'),
    });
    await owner.database.products.update(espresso, {
      price: 17_000,
      ...touched('2026-10-09T04:10:00.000Z'),
    });
    await owner.engine.syncOnce();
    await phone.syncOnce();
    await owner.engine.syncOnce();

    expect((await phoneDb.products.get(espresso))?.price).toBe(17_000);
    expect((await owner.database.products.get(espresso))?.price).toBe(17_000);
    expect((await phoneDb.products.get(espresso))?.pending).toBeUndefined();

    // A newer edit on the phone then reaches the owner.
    await phoneDb.products.update(espresso, {
      name: 'Espresso Single',
      ...touched('2026-10-09T04:20:00.000Z'),
    });
    await phone.syncOnce();
    await owner.engine.syncOnce();
    expect((await owner.database.products.get(espresso))?.name).toBe('Espresso Single');
  });

  it('a void done on one phone reaches the other and cannot be undone by a stale copy', async () => {
    const { owner, phoneDb, phone, phoneDeviceId, sell } = await twoDevices();
    const sale = await sell(phoneDb, phoneDeviceId, ['Espresso'], '2026-10-09T05:00:00.000Z');
    await phone.syncOnce();
    await owner.engine.syncOnce();

    await owner.database.transactions.update(sale.id, {
      status: 'void',
      voidReason: 'Salah input',
      voidedBy: owner.owner.id,
      voidedAt: '2026-10-09T05:10:00.000Z',
      ...touched('2026-10-09T05:10:00.000Z'),
    });
    await owner.engine.syncOnce();
    await phone.syncOnce();
    expect(await phoneDb.transactions.get(sale.id)).toMatchObject({
      status: 'void',
      voidReason: 'Salah input',
    });

    // The phone's old "paid" copy, sent again, changes nothing on the server.
    await phoneDb.transactions.update(sale.id, {
      status: 'paid',
      ...touched('2026-10-09T05:20:00.000Z'),
    });
    await phone.syncOnce();
    expect((await phoneDb.transactions.get(sale.id))?.status).toBe('void');
    const server = await owner.client
      .from('transactions')
      .select('status')
      .eq('id', sale.id)
      .single();
    expect(server.data?.status).toBe('void');
  });

  it('images added on one phone are downloaded by the other', async () => {
    const { owner, phoneDb, phone } = await twoDevices();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const imageId = await saveImage(
      owner.database,
      owner.storeId,
      new Blob([bytes], { type: 'image/jpeg' }),
      '2026-10-09T06:00:00.000Z',
    );
    await owner.database.stores.update(owner.storeId, {
      qrisImageId: imageId,
      ...touched('2026-10-09T06:00:00.000Z'),
    });
    await owner.engine.syncOnce();
    await phone.syncOnce();

    expect((await phoneDb.stores.get(owner.storeId))?.qrisImageId).toBe(imageId);
    const image = await phoneDb.images.get(imageId);
    expect(new Uint8Array(await image!.blob!.arrayBuffer())).toEqual(bytes);
  });
});
