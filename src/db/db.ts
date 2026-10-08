import { Dexie, type EntityTable } from 'dexie';
import type {
  AuditLogEntry,
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
  }
}

export const db = new PosDatabase();
