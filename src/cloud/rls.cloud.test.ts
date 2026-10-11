import { describe, expect, it } from 'vitest';
import { anonymousClient, connectedOwnerDevice, newClient, ownerClient } from '../test/cloud';
import { createPairingCode, myStores, revokeDevice } from './account';
import { toServerRow } from './mapping';

/**
 * Row Level Security, proven against a real local Supabase:
 * one store's data can never be read or changed from another store's account.
 */
describe('RLS: data satu toko tidak bisa diakses toko lain', () => {
  it('another owner cannot read store A, through tables or the sync API', async () => {
    const a = await connectedOwnerDevice();
    const b = await connectedOwnerDevice();

    // Store A is on the server and visible to its owner.
    const own = await a.client.from('products').select('id').eq('store_id', a.storeId);
    expect(own.data).toHaveLength(15);

    for (const table of [
      'stores',
      'users',
      'products',
      'shifts',
      'transactions',
      'audit_log',
      'cash_movements',
    ]) {
      const { data, error } = await b.client.from(table).select('id').eq('store_id', a.storeId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    const pull = await b.client.rpc('pull_changes', {
      p_store_id: a.storeId,
      p_cursors: {},
      p_limit: 10,
    });
    expect(pull.error?.message).toBe('not_member');
  });

  it('another owner cannot write into store A in any way', async () => {
    const a = await connectedOwnerDevice();
    const b = await connectedOwnerDevice();
    const espresso = a.product('Espresso');

    // Through the sync API, for store A: refused outright.
    const asA = await b.client.rpc('push_changes', {
      p_store_id: a.storeId,
      p_changes: { products: [toServerRow({ ...espresso, name: 'Diretas' })] },
    });
    expect(asA.error?.message).toBe('not_member');

    // Through B's own store, with A's store id or A's row id: each row is refused.
    const viaB = await b.client.rpc('push_changes', {
      p_store_id: b.storeId,
      p_changes: {
        products: [
          toServerRow({ ...espresso, name: 'Diretas 1' }),
          toServerRow({ ...espresso, storeId: b.storeId, name: 'Diretas 2' }),
        ],
      },
    });
    expect(viaB.error).toBeNull();
    expect(viaB.data.failed.map((f: { message: string }) => f.message)).toEqual([
      'wrong_store',
      expect.stringContaining('row-level security'),
    ]);

    // Directly on the tables.
    const insert = await b.client
      .from('categories')
      .insert(
        toServerRow({ ...(await a.database.categories.toArray())[0]!, id: crypto.randomUUID() }),
      );
    expect(insert.error?.message).toContain('row-level security');
    const update = await b.client
      .from('products')
      .update({ name: 'Diretas 3' })
      .eq('id', espresso.id)
      .select();
    expect(update.data).toEqual([]);
    const remove = await b.client.from('products').delete().eq('id', espresso.id);
    expect(remove.error?.message).toContain('permission denied');

    const { data } = await a.client.from('products').select('name').eq('id', espresso.id).single();
    expect(data?.name).toBe('Espresso');
  });

  it('nobody can delete or rewrite sales, not even the owner', async () => {
    const a = await connectedOwnerDevice();
    const row = {
      id: crypto.randomUUID(),
      store_id: a.storeId,
      created_at: '2026-10-09T03:00:00.000Z',
      updated_at: '2026-10-09T03:00:00.000Z',
      receipt_no: 'K1-261009-0001',
      device_id: a.deviceId,
      cashier_id: a.cashier.id,
      subtotal: 15000,
      discount_value: 0,
      discount_amount: 0,
      prices_include_tax: false,
      service_bps: 0,
      service_amount: 0,
      tax_bps: 0,
      tax_amount: 0,
      total: 15000,
      payment_method: 'cash',
      amount_paid: 20000,
      change_amount: 5000,
      status: 'paid',
    };
    expect((await a.client.from('transactions').insert(row)).error).toBeNull();

    const remove = await a.client.from('transactions').delete().eq('id', row.id);
    expect(remove.error?.message).toContain('permission denied');
    // Editing the amount is ignored; only the status may move forward.
    await a.client
      .from('transactions')
      .update({ total: 1, updated_at: '2026-10-09T04:00:00.000Z' })
      .eq('id', row.id);
    const { data } = await a.client.from('transactions').select('total').eq('id', row.id).single();
    expect(data?.total).toBe(15000);

    const item = await a.client.from('audit_log').update({ reason: 'x' }).eq('store_id', a.storeId);
    expect(item.error?.message).toContain('permission denied');

    // Kas masuk/keluar is append-only too.
    const movement = {
      id: crypto.randomUUID(),
      store_id: a.storeId,
      created_at: '2026-10-09T03:00:00.000Z',
      updated_at: '2026-10-09T03:00:00.000Z',
      shift_id: crypto.randomUUID(),
      device_id: a.deviceId,
      type: 'out',
      amount: 10000,
      reason: 'Beli es batu',
      user_id: a.cashier.id,
    };
    expect((await a.client.from('cash_movements').insert(movement)).error).toBeNull();
    const edit = await a.client.from('cash_movements').update({ amount: 1 }).eq('id', movement.id);
    expect(edit.error?.message).toContain('permission denied');
    const drop = await a.client.from('cash_movements').delete().eq('id', movement.id);
    expect(drop.error?.message).toContain('permission denied');
    // Pushed again with another amount: the first version stays.
    await a.client.rpc('push_changes', {
      p_store_id: a.storeId,
      p_changes: { cash_movements: [{ ...movement, amount: 1 }] },
    });
    const kept = await a.client.from('cash_movements').select('amount').eq('id', movement.id);
    expect(kept.data).toEqual([{ amount: 10000 }]);
    const zero = await a.client
      .from('cash_movements')
      .insert({ ...movement, id: crypto.randomUUID(), amount: 0 });
    expect(zero.error?.message).toContain('check constraint');
  });

  it('a visitor without an account sees nothing', async () => {
    const a = await connectedOwnerDevice();
    const anon = newClient();
    const { data } = await anon.from('products').select('id').eq('store_id', a.storeId);
    expect(data ?? []).toEqual([]);
    const pull = await anon.rpc('pull_changes', { p_store_id: a.storeId, p_cursors: {} });
    expect(pull.error).not.toBeNull();
  });

  it('store images are private to the store', async () => {
    const a = await connectedOwnerDevice();
    const b = await connectedOwnerDevice();
    const path = `${a.storeId}/${crypto.randomUUID()}`;
    const file = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });

    expect((await a.client.storage.from('store-images').upload(path, file)).error).toBeNull();
    expect((await b.client.storage.from('store-images').download(path)).error).not.toBeNull();
    const intoA = await b.client.storage
      .from('store-images')
      .upload(`${a.storeId}/${crypto.randomUUID()}`, file);
    expect(intoA.error).not.toBeNull();
    expect((await a.client.storage.from('store-images').download(path)).data).not.toBeNull();
  });
});

describe('Perangkat terdaftar dan kode pasang', () => {
  it('pairs a cashier phone with a one-time code and limits what it may do', async () => {
    const a = await connectedOwnerDevice();
    const { code } = await createPairingCode(a.client, a.storeId);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);

    const phone = await anonymousClient();
    const claim = await phone.rpc('claim_pairing_code', {
      p_code: code.toLowerCase(),
      p_device_id: crypto.randomUUID(),
      p_device_name: 'Kasir depan',
    });
    expect(claim.data).toMatchObject({ ok: true, store_id: a.storeId, device_code: 'K2' });
    expect(await myStores(phone)).toEqual([
      expect.objectContaining({ store_id: a.storeId, role: 'device' }),
    ]);

    // The code works only once.
    const other = await anonymousClient();
    const again = await other.rpc('claim_pairing_code', {
      p_code: code,
      p_device_id: crypto.randomUUID(),
      p_device_name: 'Lain',
    });
    expect(again.data).toEqual({ ok: false, error: 'invalid_code' });

    // A paired phone reads the store, may add cashiers, but cannot touch the owner or add phones.
    const products = await phone.from('products').select('id').eq('store_id', a.storeId);
    expect(products.data).toHaveLength(15);
    const pushed = await phone.rpc('push_changes', {
      p_store_id: a.storeId,
      p_changes: {
        users: [
          toServerRow({ ...a.owner, pinHash: 'ganti', updatedAt: '2026-10-09T05:00:00.000Z' }),
          toServerRow({ ...a.cashier, name: 'Kasir Pagi', updatedAt: '2026-10-09T05:00:00.000Z' }),
        ],
      },
    });
    expect(pushed.data.failed).toEqual([
      expect.objectContaining({ id: a.owner.id, message: expect.stringContaining('row-level') }),
    ]);
    // It may update its own device row (last seen), not another device's.
    const ownDevice = (await phone.from('devices').select('*').eq('code', 'K2').single()).data;
    const devicePush = await phone.rpc('push_changes', {
      p_store_id: a.storeId,
      p_changes: {
        devices: [
          {
            ...ownDevice,
            last_seen_at: '2026-10-09T05:00:00.000Z',
            updated_at: '2026-10-09T05:00:00.000Z',
          },
          toServerRow({
            ...(await a.database.devices.get(a.deviceId))!,
            name: 'Diambil alih',
            updatedAt: '2026-10-09T05:00:00.000Z',
          }),
        ],
      },
    });
    expect(devicePush.data.failed).toEqual([expect.objectContaining({ id: a.deviceId })]);

    const codeFromPhone = await phone.rpc('create_pairing_code', { p_store_id: a.storeId });
    expect(codeFromPhone.error?.message).toBe('owner_account_required');
  });

  it('stops a phone after 5 wrong codes', async () => {
    const phone = await anonymousClient();
    for (let i = 0; i < 5; i++) {
      const { data } = await phone.rpc('claim_pairing_code', {
        p_code: 'AAAA-AAAA',
        p_device_id: crypto.randomUUID(),
        p_device_name: 'Coba',
      });
      expect(data).toEqual({ ok: false, error: 'invalid_code' });
    }
    const { data } = await phone.rpc('claim_pairing_code', {
      p_code: 'AAAA-AAAA',
      p_device_id: crypto.randomUUID(),
      p_device_name: 'Coba',
    });
    expect(data).toEqual({ ok: false, error: 'too_many_attempts' });
  });

  it('a disconnected phone can no longer read or send anything', async () => {
    const a = await connectedOwnerDevice();
    const { code } = await createPairingCode(a.client, a.storeId);
    const phone = await anonymousClient();
    const deviceId = crypto.randomUUID();
    await phone.rpc('claim_pairing_code', {
      p_code: code,
      p_device_id: deviceId,
      p_device_name: 'Hilang',
    });

    await revokeDevice(a.client, deviceId);

    const pull = await phone.rpc('pull_changes', { p_store_id: a.storeId, p_cursors: {} });
    expect(pull.error?.message).toBe('not_member');
    const { data } = await phone.from('products').select('id').eq('store_id', a.storeId);
    expect(data).toEqual([]);
    const device = await a.client.from('devices').select('active').eq('id', deviceId).single();
    expect(device.data?.active).toBe(false);
  });

  it('only a confirmed owner account can create a store, and only one', async () => {
    const phone = await anonymousClient();
    const anonymousStore = await phone.rpc('create_store', { p_store_id: crypto.randomUUID() });
    expect(anonymousStore.error?.message).toBe('owner_account_required');

    const owner = await ownerClient();
    expect((await owner.rpc('create_store', { p_store_id: crypto.randomUUID() })).error).toBeNull();
    const second = await owner.rpc('create_store', { p_store_id: crypto.randomUUID() });
    expect(second.error?.message).toBe('already_owner');
  });
});
