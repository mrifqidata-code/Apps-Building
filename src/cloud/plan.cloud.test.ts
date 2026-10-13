import { describe, expect, it } from 'vitest';
import { EMPTY_CART, cartReducer } from '../db/cart';
import { completeSale } from '../db/checkout';
import { PosDatabase } from '../db/db';
import { openShift } from '../db/shift';
import { META_DEVICE_ID } from '../db/seed';
import { adminClient, anonymousClient, connectedOwnerDevice, engineFor } from '../test/cloud';
import { createPairingCode, pairWithCode } from './account';
import { CloudError } from './api';
import { fetchStorePlan } from './plan';

const DAY_MS = 24 * 60 * 60 * 1000;
const admin = () => adminClient();

async function endPlan(storeId: string) {
  const { error } = await admin()
    .from('store_plans')
    .update({ active_until: new Date(Date.now() - 60_000).toISOString() })
    .eq('store_id', storeId);
  if (error) throw error;
}

/** The owner's phone plus a paired cashier phone, both synced. */
async function storeWithCashierPhone() {
  const owner = await connectedOwnerDevice();
  const { code } = await createPairingCode(owner.client, owner.storeId);
  const phoneDb = new PosDatabase(`test-${crypto.randomUUID()}`);
  const phoneClient = await anonymousClient();
  await pairWithCode(phoneClient, phoneDb, code, 'Kasir depan');
  const phone = engineFor(phoneDb, phoneClient, owner.storeId);
  await phone.syncOnce();
  return { owner, phoneDb, phoneClient, phone };
}

describe('Paket toko (M7, Supabase lokal)', () => {
  it('a new cloud store gets a 30-day trial, visible to its own phones only', async () => {
    const { owner, phoneClient } = await storeWithCashierPhone();
    const plan = await fetchStorePlan(owner.client, owner.storeId);
    expect(plan?.plan).toBe('trial');
    const daysLeft = (Date.parse(plan!.activeUntil!) - Date.now()) / DAY_MS;
    expect(daysLeft).toBeGreaterThan(29.9);
    expect(daysLeft).toBeLessThanOrEqual(30);

    expect(await fetchStorePlan(phoneClient, owner.storeId)).toEqual(plan);
    const other = await connectedOwnerDevice();
    expect(await fetchStorePlan(other.client, owner.storeId)).toBeNull();
  });

  it('nobody can give their own store more time from the app', async () => {
    const { owner } = await storeWithCashierPhone();
    const forever = { active_until: null, plan: 'toko' };

    const update = await owner.client
      .from('store_plans')
      .update(forever)
      .eq('store_id', owner.storeId)
      .select();
    expect(update.error?.message).toContain('permission denied');
    const insert = await owner.client
      .from('store_plans')
      .upsert({ store_id: owner.storeId, ...forever });
    expect(insert.error?.message).toContain('permission denied');
    const remove = await owner.client.from('store_plans').delete().eq('store_id', owner.storeId);
    expect(remove.error?.message).toContain('permission denied');

    for (const [fn, args] of [
      ['admin_extend_plan', { p_store_id: owner.storeId, p_months: 12 }],
      ['admin_set_plan_unlimited', { p_store_id: owner.storeId }],
      ['admin_stores', {}],
    ] as const) {
      const { error } = await owner.client.rpc(fn, args);
      expect(error?.message, fn).toContain('permission denied');
    }
    expect((await fetchStorePlan(owner.client, owner.storeId))?.plan).toBe('trial');
  });

  it('when the plan runs out, the server refuses the store data until it is extended', async () => {
    const { owner, phoneDb, phoneClient, phone } = await storeWithCashierPhone();
    await endPlan(owner.storeId);

    // Sync, tables and new phones are all closed, for the owner and the cashier phone.
    await expect(owner.engine.syncOnce()).rejects.toMatchObject({ kind: 'plan-inactive' });
    await expect(phone.syncOnce()).rejects.toBeInstanceOf(CloudError);
    await expect(phone.syncOnce()).rejects.toMatchObject({ kind: 'plan-inactive' });
    const read = await phoneClient.from('products').select('id').eq('store_id', owner.storeId);
    expect(read.error?.message).toBe('plan_inactive');
    const pairing = await owner.client.rpc('create_pairing_code', { p_store_id: owner.storeId });
    expect(pairing.error?.message).toBe('plan_inactive');
    const image = await owner.client.storage
      .from('store-images')
      .upload(`${owner.storeId}/${crypto.randomUUID()}`, new Blob(['x'], { type: 'image/png' }));
    expect(image.error).not.toBeNull();

    // The phones can still see why.
    const plan = await fetchStorePlan(phoneClient, owner.storeId);
    expect(Date.parse(plan!.activeUntil!)).toBeLessThan(Date.now());

    // Meanwhile the cashier keeps selling offline.
    const phoneDeviceId = (await phoneDb.meta.get(META_DEVICE_ID))!.value as string;
    const now = new Date().toISOString();
    await openShift(phoneDb, {
      storeId: owner.storeId,
      deviceId: phoneDeviceId,
      userId: owner.cashier.id,
      openingCash: 0,
      now,
    });
    const sale = await completeSale(phoneDb, {
      storeId: owner.storeId,
      deviceId: phoneDeviceId,
      cashier: { id: owner.cashier.id, role: 'cashier' },
      cart: cartReducer(EMPTY_CART, { type: 'add', productId: owner.product('Espresso').id }),
      paymentMethod: 'cash',
      amountPaid: 15_000,
      now,
    });

    // The operator extends it by a month after the transfer: the sale arrives.
    const { data: extended, error } = await admin().rpc('admin_extend_plan', {
      p_store_id: owner.storeId,
      p_months: 1,
      p_note: 'Transfer BCA 13 Okt',
    });
    expect(error).toBeNull();
    expect(extended).toMatchObject({ plan: 'toko', note: 'Transfer BCA 13 Okt' });
    await phone.syncOnce();
    await owner.engine.syncOnce();
    expect(await owner.database.transactions.get(sale.id)).toMatchObject({
      receiptNo: sale.receiptNo,
    });
  });

  it('extending adds months to the end of the period; unlimited has no end', async () => {
    const { owner } = await storeWithCashierPhone();
    const trialEnd = Date.parse((await fetchStorePlan(owner.client, owner.storeId))!.activeUntil!);

    await admin().rpc('admin_extend_plan', { p_store_id: owner.storeId, p_months: 2 });
    const extended = await fetchStorePlan(owner.client, owner.storeId);
    const added = (Date.parse(extended!.activeUntil!) - trialEnd) / DAY_MS;
    expect(extended?.plan).toBe('toko');
    expect(added).toBeGreaterThanOrEqual(59);
    expect(added).toBeLessThanOrEqual(62);

    const bad = await admin().rpc('admin_extend_plan', { p_store_id: owner.storeId, p_months: 0 });
    expect(bad.error?.message).toContain('1 sampai 36');

    await admin().rpc('admin_set_plan_unlimited', { p_store_id: owner.storeId });
    expect(await fetchStorePlan(owner.client, owner.storeId)).toEqual({
      plan: 'toko',
      activeUntil: null,
    });
    // Extending an unlimited plan keeps it unlimited.
    await admin().rpc('admin_extend_plan', { p_store_id: owner.storeId, p_months: 1 });
    expect((await fetchStorePlan(owner.client, owner.storeId))?.activeUntil).toBeNull();
  });

  it('admin_stores lists each store with its owner email and plan', async () => {
    const { owner } = await storeWithCashierPhone();
    const { data: user } = await owner.client.auth.getUser();
    const { data, error } = await admin().rpc('admin_stores');
    expect(error).toBeNull();
    const row = (data as { store_id: string }[]).find((r) => r.store_id === owner.storeId);
    expect(row).toMatchObject({
      store_name: 'Kedai Kopi Senja (Demo)',
      owner_email: user.user!.email,
      plan: 'trial',
      active_devices: 2,
      last_sale_at: null,
    });
  });
});
