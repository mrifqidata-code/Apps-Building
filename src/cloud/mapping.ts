import { SYNCED_TABLE_NAMES, type SyncedTableName } from '../db/db';

/** A row as Postgres returns it (snake_case keys). */
export type ServerRow = Record<string, unknown>;

/** Dexie table name -> Supabase table name. */
export const SERVER_TABLE: Record<SyncedTableName, string> = {
  stores: 'stores',
  users: 'users',
  devices: 'devices',
  categories: 'categories',
  products: 'products',
  variantGroups: 'variant_groups',
  productVariants: 'product_variants',
  customers: 'customers',
  shifts: 'shifts',
  images: 'images',
  transactions: 'transactions',
  transactionItems: 'transaction_items',
  stockMovements: 'stock_movements',
  auditLog: 'audit_log',
  cashMovements: 'cash_movements',
};

export const LOCAL_TABLE: Record<string, SyncedTableName> = Object.fromEntries(
  SYNCED_TABLE_NAMES.map((name) => [SERVER_TABLE[name], name]),
);

/**
 * How conflicting versions of a row are resolved (same rules as the triggers
 * in supabase/migrations; see docs/sinkron.md):
 * - lww: master data, the newest updatedAt wins.
 * - transaction: never edited; only paid -> void/refunded.
 * - append: written once, never changed.
 */
export type TableKind = 'lww' | 'transaction' | 'append';

export function tableKind(table: SyncedTableName): TableKind {
  if (table === 'transactions') return 'transaction';
  if (
    table === 'transactionItems' ||
    table === 'stockMovements' ||
    table === 'auditLog' ||
    table === 'cashMovements'
  ) {
    return 'append';
  }
  return 'lww';
}

/** Fields that only exist on the device. */
const LOCAL_ONLY = new Set(['pending', 'syncError', 'syncedAt', 'blob']);

export const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const toCamel = (key: string) =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Device row -> server row. Nested JSON (variants, audit before/after) is sent as is. */
export function toServerRow(row: object): ServerRow {
  const out: ServerRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (LOCAL_ONLY.has(key) || value === undefined) continue;
    out[toSnake(key)] = value;
  }
  return out;
}

/**
 * Server row -> device row. Timestamps come back as "2026-10-09T02:04:53.203681+00:00";
 * the device stores them like nowIso() ("2026-10-09T02:04:53.203Z") so they compare as strings.
 */
export function fromServerRow<T>(row: ServerRow): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[toCamel(key)] =
      key.endsWith('_at') && typeof value === 'string' ? new Date(value).toISOString() : value;
  }
  return out as T;
}
