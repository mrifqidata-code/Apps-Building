import type { Bps, Rupiah } from '../domain/money';
import type { IsoDateTime } from '../domain/time';

/**
 * Row types for the on-device database. Field names are camelCase here and
 * map 1:1 to snake_case columns in Supabase (M5), e.g. storeId -> store_id.
 *
 * Every synced row carries the columns sync needs from day one:
 * - id: UUIDv7 created on the device (also the client_uuid for dedup)
 * - storeId: tenant; every query and RLS policy is scoped by it
 * - createdAt / updatedAt: UTC ISO strings
 * - syncedAt: null until the server has the latest version of the row
 * - deletedAt: soft delete, so deletions also reach other devices
 * - pending: 1 while a local change still has to be sent (indexed; absent once sent)
 * - syncError: why the server last rejected this row, if it did
 */
export interface SyncedRow {
  id: string;
  storeId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  syncedAt: IsoDateTime | null;
  deletedAt: IsoDateTime | null;
  pending?: 1;
  syncError?: string;
}

export interface Store extends SyncedRow {
  name: string;
  address: string;
  phone: string;
  logoImageId: string | null;
  receiptFooter: string;
  /** true: menu prices already include service and PB1 ("nett"). */
  pricesIncludeTax: boolean;
  /** Restaurant tax (PB1); 0 = off. */
  pb1Bps: Bps;
  /** Service charge; 0 = off. */
  serviceBps: Bps;
  qrisImageId: string | null;
  /** Largest discount a cashier may give without the owner; 0 = none. */
  cashierMaxDiscountBps: Bps;
}

export type UserRole = 'owner' | 'cashier';

export interface User extends SyncedRow {
  name: string;
  role: UserRole;
  /** Owners only; cashiers sign in with a PIN on a registered device. */
  email: string | null;
  /** Supabase auth.users id, linked in M5. */
  authUserId: string | null;
  pinHash: string | null;
  pinSalt: string | null;
  active: boolean;
}

export interface Device extends SyncedRow {
  name: string;
  /** Short code unique within the store, used in receipt numbers (e.g. "K1"). */
  code: string;
  active: boolean;
  lastSeenAt: IsoDateTime | null;
}

export interface Category extends SyncedRow {
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface Product extends SyncedRow {
  categoryId: string | null;
  name: string;
  price: Rupiah;
  /** HPP / modal per unit. */
  cost: Rupiah;
  imageId: string | null;
  active: boolean;
  trackStock: boolean;
  lowStockThreshold: number | null;
  sortOrder: number;
}

/** "single": pick exactly one (Ukuran). "multi": pick any number (Topping). */
export type VariantGroupMode = 'single' | 'multi';

export interface VariantGroup extends SyncedRow {
  productId: string;
  name: string;
  mode: VariantGroupMode;
  required: boolean;
  sortOrder: number;
}

export interface ProductVariant extends SyncedRow {
  productId: string;
  groupId: string;
  name: string;
  priceDelta: Rupiah;
  costDelta: Rupiah;
  sortOrder: number;
  active: boolean;
}

/** Optional; only kept when a customer wants their receipt on WhatsApp. */
export interface Customer extends SyncedRow {
  name: string;
  whatsapp: string | null;
}

/** Buka kasir to tutup kasir on one device. At most one open shift (closedAt null) per device. */
export interface Shift extends SyncedRow {
  deviceId: string;
  openedBy: string;
  openedAt: IsoDateTime;
  openingCash: Rupiah;
  closedBy: string | null;
  closedAt: IsoDateTime | null;
  /** Cash the system expects in the drawer at close. */
  expectedCash: Rupiah | null;
  /** Counted by the cashier before seeing expectedCash. */
  countedCash: Rupiah | null;
  /** countedCash - expectedCash: positive = more than expected. */
  cashDifference: Rupiah | null;
  note: string | null;
}

export type CashMovementType = 'in' | 'out';

/**
 * Cash put into or taken out of the drawer during a shift that is not a sale,
 * e.g. buying ice or adding small change. Append-only.
 */
export interface CashMovement extends SyncedRow {
  shiftId: string;
  deviceId: string;
  type: CashMovementType;
  /** Always positive; `type` says which way it went. */
  amount: Rupiah;
  reason: string;
  userId: string;
}

export type DiscountType = 'amount' | 'percent';
export type PaymentMethod = 'cash' | 'qris' | 'transfer';
export type TransactionStatus = 'paid' | 'void' | 'refunded';

export interface Transaction extends SyncedRow {
  receiptNo: string;
  deviceId: string;
  shiftId: string | null;
  cashierId: string;
  customerId: string | null;
  subtotal: Rupiah;
  discountType: DiscountType | null;
  /** Rupiah for 'amount', basis points for 'percent'. */
  discountValue: number;
  discountAmount: Rupiah;
  /** Snapshots of the store settings at the time of sale. */
  pricesIncludeTax: boolean;
  serviceBps: Bps;
  serviceAmount: Rupiah;
  taxBps: Bps;
  taxAmount: Rupiah;
  total: Rupiah;
  paymentMethod: PaymentMethod;
  amountPaid: Rupiah;
  changeAmount: Rupiah;
  status: TransactionStatus;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: IsoDateTime | null;
}

export interface VariantSnapshot {
  groupName: string;
  name: string;
  priceDelta: Rupiah;
  costDelta: Rupiah;
}

/** Name, price, cost and variants are copied at sale time so later edits never change history. */
export interface TransactionItem extends SyncedRow {
  transactionId: string;
  productId: string;
  productName: string;
  variants: VariantSnapshot[];
  qty: number;
  unitPrice: Rupiah;
  unitCost: Rupiah;
  discountType: DiscountType | null;
  discountValue: number;
  discountAmount: Rupiah;
  lineTotal: Rupiah;
  note: string | null;
}

export type StockMovementType = 'in' | 'sale' | 'opname' | 'void_return';

/** Stock on hand is the sum of qtyDelta, so concurrent sales on two devices never overwrite each other. */
export interface StockMovement extends SyncedRow {
  productId: string;
  type: StockMovementType;
  qtyDelta: number;
  /** Physical count entered during stock opname. */
  countedQty: number | null;
  transactionId: string | null;
  note: string | null;
  userId: string | null;
}

export type AuditAction =
  'void' | 'refund' | 'price_change' | 'cost_change' | 'stock_opname' | 'settings_change';

/** Append-only. */
export interface AuditLogEntry extends SyncedRow {
  actorId: string | null;
  deviceId: string | null;
  action: AuditAction;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/**
 * Product photos, store logo and the QRIS image. The file itself goes to
 * Supabase Storage; blob is null while an image from another device is still downloading.
 */
export interface StoredImage extends SyncedRow {
  blob: Blob | null;
  mimeType: string;
}

/* ---- Local-only tables (never synced) ---- */

export interface Counter {
  key: string;
  value: number;
}

/** Device-level settings such as which store and device this browser is. */
export interface MetaEntry {
  key: string;
  value: unknown;
}
