import { afterEach, describe, expect, it } from 'vitest';
import { PIN_LOCK_MS } from '../domain/pin';
import { META_ACTIVE_USER, addCashier, checkPin, setUserPin, signIn, signOut } from './auth';
import { demoDatabase } from '../test/db';

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function setup() {
  const demo = await demoDatabase();
  cleanup = () => demo.database.delete();
  return demo;
}

describe('PIN sign-in', () => {
  it('asks for a PIN to be created first', async () => {
    const { database, cashier } = await setup();
    expect(await checkPin(database, cashier.id, '1234')).toEqual({ ok: false, reason: 'no-pin' });
  });

  it('signs in with the right PIN and remembers the active user', async () => {
    const { database, cashier } = await setup();
    await setUserPin(database, cashier.id, '2580', '2026-10-08T01:00:00.000Z');

    expect(await signIn(database, cashier.id, '2580')).toEqual({ ok: true });
    expect((await database.meta.get(META_ACTIVE_USER))?.value).toBe(cashier.id);

    await signOut(database);
    expect(await database.meta.get(META_ACTIVE_USER)).toBeUndefined();
  });

  it('stores only a hash and marks the user for sync', async () => {
    const { database, cashier } = await setup();
    await setUserPin(database, cashier.id, '2580', '2026-10-08T02:00:00.000Z');
    const user = await database.users.get(cashier.id);
    expect(user?.pinHash).toBeTruthy();
    expect(JSON.stringify(user)).not.toContain('2580');
    expect(user?.updatedAt).toBe('2026-10-08T02:00:00.000Z');
    expect(user?.syncedAt).toBeNull();
  });

  it('counts down attempts and locks after five wrong PINs', async () => {
    const { database, cashier } = await setup();
    await setUserPin(database, cashier.id, '2580', '2026-10-08T01:00:00.000Z');
    const now = 1_000_000;

    expect(await signIn(database, cashier.id, '0000', now)).toEqual({
      ok: false,
      reason: 'wrong',
      attemptsLeft: 4,
    });
    for (let i = 0; i < 3; i++) await signIn(database, cashier.id, '0000', now);
    expect(await signIn(database, cashier.id, '0000', now)).toEqual({
      ok: false,
      reason: 'locked',
      retryInMs: PIN_LOCK_MS,
    });
    // Even the right PIN is refused while locked.
    expect((await signIn(database, cashier.id, '2580', now + 1_000)).ok).toBe(false);
    expect(await database.meta.get(META_ACTIVE_USER)).toBeUndefined();
    // After the lock, the right PIN works and resets the counter.
    expect(await signIn(database, cashier.id, '2580', now + PIN_LOCK_MS)).toEqual({ ok: true });
  });

  it('refuses inactive users', async () => {
    const { database, cashier } = await setup();
    await setUserPin(database, cashier.id, '2580', '2026-10-08T01:00:00.000Z');
    await database.users.update(cashier.id, { active: false });
    expect(await checkPin(database, cashier.id, '2580')).toEqual({ ok: false, reason: 'inactive' });
  });

  it('adds cashiers who then create their own PIN', async () => {
    const { database, storeId } = await setup();
    const id = await addCashier(database, storeId, '  Budi  ', '2026-10-08T05:00:00.000Z');
    expect(await database.users.get(id)).toMatchObject({
      name: 'Budi',
      role: 'cashier',
      pinHash: null,
      active: true,
      syncedAt: null,
    });
    expect(await checkPin(database, id, '1234')).toEqual({ ok: false, reason: 'no-pin' });
    await expect(addCashier(database, storeId, '  ', '2026-10-08T05:00:00.000Z')).rejects.toThrow(
      'Nama kasir wajib diisi.',
    );
  });
});
