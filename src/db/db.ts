import { Dexie, type EntityTable } from 'dexie';
import type {
  AuditLogEntry,
  CashMovement,
  Category,
  Counter,
  Customer,
  Device,
  MetaEntry,
  Product,
  ProductVariant,
  Shift,
  StockMovement,
  Store,
  StoredImage,
  Transaction,
  TransactionItem,
  User,
  VariantGroup,
} from './schema';

export class PosDatabase extends Dexie {
  stores!: EntityTable<Store, 'id'>;
  users!: EntityTable<User, 'id'>;
  devices!: EntityTable<Device, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  products!: EntityTable<Product, 'id'>;
  variantGroups!: EntityTable<VariantGroup, 'id'>;
  productVariants!: EntityTable<ProductVariant, 'id'>;
  customers!: EntityTable<Customer, 'id'>;
  shifts!: EntityTable<Shift, 'id'>;
  cashMovements!: EntityTable<CashMovement, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  transactionItems!: EntityTable<TransactionItem, 'id'>;
  stockMovements!: EntityTable<StockMovement, 'id'>;
  auditLog!: EntityTable<AuditLogEntry, 'id'>;
  images!: EntityTable<StoredImage, 'id'>;
  counters!: EntityTable<Counter, 'key'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'pos-sederhana') {
    super(name);
    // Only indexed fields are listed; other fields are stored but not indexed.
    // Changing this requires a new db.version(n) with an upgrade, never editing v1.
    this.version(1).stores({
      stores: 'id',
      users: 'id, storeId',
      devices: 'id, storeId, &[storeId+code]',
      categories: 'id, storeId',
      products: 'id, storeId, categoryId',
      variantGroups: 'id, storeId, productId',
      productVariants: 'id, storeId, productId, groupId',
      customers: 'id, storeId',
      shifts: 'id, storeId, deviceId, openedAt',
      transactions: 'id, storeId, &[storeId+receiptNo], createdAt, shiftId',
      transactionItems: 'id, storeId, transactionId, productId',
      stockMovements: 'id, storeId, productId, createdAt',
      auditLog: 'id, storeId, createdAt, entityId',
      images: 'id, storeId',
      counters: 'key',
      meta: 'key',
    });

    // v2 (M5): `pending` marks rows with local changes not yet sent to the server.
    // IndexedDB leaves rows without the field out of the index, so finding what
    // to send never scans the whole table.
    this.version(2)
      .stores({
        stores: 'id, pending',
        users: 'id, storeId, pending',
        devices: 'id, storeId, &[storeId+code], pending',
        categories: 'id, storeId, pending',
        products: 'id, storeId, categoryId, pending',
        variantGroups: 'id, storeId, productId, pending',
        productVariants: 'id, storeId, productId, groupId, pending',
        customers: 'id, storeId, pending',
        shifts: 'id, storeId, deviceId, openedAt, pending',
        transactions: 'id, storeId, &[storeId+receiptNo], createdAt, shiftId, pending',
        transactionItems: 'id, storeId, transactionId, productId, pending',
        stockMovements: 'id, storeId, productId, createdAt, pending',
        auditLog: 'id, storeId, createdAt, entityId, pending',
        images: 'id, storeId, pending',
      })
      .upgrade(async (tx) => {
        // Nothing was ever synced before v2, so every existing row still has to be sent.
        // (The tables as they were in v2; later tables do not exist yet during this upgrade.)
        for (const table of SYNCED_TABLE_NAMES.slice(0, V2_SYNCED_TABLE_COUNT)) {
          await tx
            .table(table)
            .toCollection()
            .modify((row: { syncedAt: string | null; pending?: 1 }) => {
              if (row.syncedAt === null) row.pending = 1;
            });
        }
      });

    // v3 (M3): kas masuk/keluar during a shift.
    this.version(3).stores({
      cashMovements: 'id, storeId, shiftId, createdAt, pending',
    });
  }
}

/** Tables that sync with the server, parents before children. */
export const SYNCED_TABLE_NAMES = [
  'stores',
  'users',
  'devices',
  'categories',
  'products',
  'variantGroups',
  'productVariants',
  'customers',
  'shifts',
  'images',
  'transactions',
  'transactionItems',
  'stockMovements',
  'auditLog',
  // Added in v3 (M3). New tables go at the end.
  'cashMovements',
] as const;

/** SYNCED_TABLE_NAMES had 14 tables in Dexie v2. */
const V2_SYNCED_TABLE_COUNT = 14;

export type SyncedTableName = (typeof SYNCED_TABLE_NAMES)[number];

export const db = new PosDatabase();
