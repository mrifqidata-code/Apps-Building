import { describe, expect, it } from 'vitest';
import type { Product, Transaction } from '../db/schema';
import { fromServerRow, toServerRow, toCamel, toSnake } from './mapping';
import { mergeRemote } from './merge';

const product = (over: Partial<Product>): Product => ({
  id: 'p1',
  storeId: 's1',
  createdAt: '2026-10-09T01:00:00.000Z',
  updatedAt: '2026-10-09T01:00:00.000Z',
  syncedAt: '2026-10-09T01:00:01.000Z',
  deletedAt: null,
  categoryId: null,
  name: 'Espresso',
  price: 15_000,
  cost: 5_000,
  imageId: null,
  active: true,
  trackStock: false,
  lowStockThreshold: null,
  sortOrder: 0,
  ...over,
});

const tx = (over: Partial<Transaction>) =>
  ({ ...product({}), status: 'paid', ...over }) as unknown as Transaction;

describe('mergeRemote', () => {
  it('master data: newest updatedAt wins, a pending newer local edit is kept', () => {
    const remote = product({ price: 18_000, updatedAt: '2026-10-09T02:00:00.000Z' });
    expect(mergeRemote('lww', undefined, remote)).toBe(remote);
    expect(mergeRemote('lww', product({}), remote)).toBe(remote);

    const newerLocal = product({
      price: 16_000,
      updatedAt: '2026-10-09T03:00:00.000Z',
      pending: 1,
    });
    expect(mergeRemote('lww', newerLocal, remote)).toBeNull();
    const olderLocal = product({
      price: 16_000,
      updatedAt: '2026-10-09T01:30:00.000Z',
      pending: 1,
    });
    expect(mergeRemote('lww', olderLocal, remote)).toBe(remote);
  });

  it('skips rows that did not change', () => {
    expect(mergeRemote('lww', product({}), product({}))).toBeNull();
  });

  it('append-only rows are never replaced', () => {
    expect(mergeRemote('append', product({}), product({ name: 'lain' }))).toBeNull();
  });

  it('transactions: a void from elsewhere always lands, a local void waits for the server', () => {
    const voided = tx({ status: 'void', updatedAt: '2026-10-09T02:00:00.000Z' });
    expect(mergeRemote('transaction', tx({ pending: 1 }), voided)).toBe(voided);
    const localVoid = tx({ status: 'refunded', pending: 1 });
    expect(mergeRemote('transaction', localVoid, tx({}))).toBeNull();
  });
});

describe('mapping', () => {
  it('maps camelCase fields to snake_case columns and back', () => {
    expect(toSnake('pb1Bps')).toBe('pb1_bps');
    expect(toSnake('lowStockThreshold')).toBe('low_stock_threshold');
    expect(toCamel('pb1_bps')).toBe('pb1Bps');
    expect(toCamel('cashier_max_discount_bps')).toBe('cashierMaxDiscountBps');
  });

  it('never sends device-only fields', () => {
    const row = toServerRow({ ...product({ pending: 1, syncError: 'x' }), blob: new Blob() });
    expect(Object.keys(row)).not.toEqual(
      expect.arrayContaining(['pending', 'sync_error', 'synced_at', 'blob']),
    );
    expect(row).toMatchObject({ store_id: 's1', track_stock: false, low_stock_threshold: null });
  });

  it('stores server timestamps in the same format as nowIso()', () => {
    const row = fromServerRow<Product>({
      id: 'p1',
      updated_at: '2026-10-09T02:04:53.203681+00:00',
      synced_at: '2026-10-09T09:04:53+07:00',
      deleted_at: null,
    });
    expect(row).toEqual({
      id: 'p1',
      updatedAt: '2026-10-09T02:04:53.203Z',
      syncedAt: '2026-10-09T02:04:53.000Z',
      deletedAt: null,
    });
  });
});
