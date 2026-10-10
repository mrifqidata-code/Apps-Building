import { assertRupiah, type Rupiah } from '../domain/money';
import { calculateCart, isDiscountWithinLimit, type CartTotals } from '../domain/pricing';
import type { IsoDateTime } from '../domain/time';
import {
  CartError,
  buildCatalogIndex,
  resolveLine,
  type Cart,
  type CatalogIndex,
  type ResolvedLine,
} from './cart';
import type { PosDatabase } from './db';
import { allocateReceiptNumber } from './receipt';
import { newRow } from './rows';
import { getOpenShift } from './shift';
import type {
  PaymentMethod,
  Product,
  StockMovement,
  Store,
  Transaction,
  TransactionItem,
  UserRole,
} from './schema';

export interface PricedCart {
  lines: ResolvedLine[];
  totals: CartTotals;
}

/** Prices a cart with the store's current tax settings. Throws CartError on invalid lines. */
export function priceCart(
  cart: Cart,
  index: CatalogIndex,
  store: Pick<Store, 'pricesIncludeTax' | 'serviceBps' | 'pb1Bps'>,
): PricedCart {
  const lines = cart.lines.map((line) => resolveLine(line, index));
  const totals = calculateCart(
    lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.line.qty, discount: l.line.discount })),
    cart.discount,
    {
      pricesIncludeTax: store.pricesIncludeTax,
      serviceBps: store.serviceBps,
      pb1Bps: store.pb1Bps,
    },
  );
  return { lines, totals };
}

export interface SaleInput {
  storeId: string;
  deviceId: string;
  cashier: { id: string; role: UserRole };
  cart: Cart;
  paymentMethod: PaymentMethod;
  /** Cash handed over; for QRIS and transfer this must equal the total. */
  amountPaid: Rupiah;
  now: IsoDateTime;
}

/**
 * Saves a sale entirely on the device, in one IndexedDB transaction:
 * receipt number, transaction, items (with price snapshots) and stock
 * movements for products that track stock. Either all of it is stored or
 * none of it is. The sale belongs to the device's open shift; without one
 * (kasir belum dibuka) nothing is saved. Returns the new transaction.
 */
export async function completeSale(database: PosDatabase, input: SaleInput): Promise<Transaction> {
  if (input.cart.lines.length === 0) throw new CartError('Keranjang masih kosong.');
  assertRupiah(input.amountPaid, 'uang diterima');

  return database.transaction(
    'rw',
    [
      database.stores,
      database.devices,
      database.shifts,
      database.products,
      database.productVariants,
      database.variantGroups,
      database.counters,
      database.transactions,
      database.transactionItems,
      database.stockMovements,
    ],
    async () => {
      const store = await database.stores.get(input.storeId);
      const device = await database.devices.get(input.deviceId);
      if (!store) throw new CartError('Data toko tidak ditemukan.');
      if (!device || device.storeId !== store.id) throw new CartError('Perangkat belum terdaftar.');
      const shift = await getOpenShift(database, device.id);
      if (!shift) throw new CartError('Kasir belum dibuka. Buka kasir dulu di layar Kasir.');

      const productIds = [...new Set(input.cart.lines.map((l) => l.productId))];
      const [products, variants, groups] = await Promise.all([
        database.products.bulkGet(productIds),
        database.productVariants.where('productId').anyOf(productIds).toArray(),
        database.variantGroups.where('productId').anyOf(productIds).toArray(),
      ]);
      const index = buildCatalogIndex(
        products.filter((p): p is Product => p !== undefined && p.storeId === store.id),
        variants,
        groups,
      );
      const { lines, totals } = priceCart(input.cart, index, store);

      if (
        input.cashier.role === 'cashier' &&
        !isDiscountWithinLimit(totals, store.cashierMaxDiscountBps)
      ) {
        throw new CartError('Diskon melebihi batas kasir. Minta pemilik untuk memberi diskon.');
      }
      if (input.paymentMethod === 'cash') {
        if (input.amountPaid < totals.total) throw new CartError('Uang yang diterima kurang.');
      } else if (input.amountPaid !== totals.total) {
        throw new CartError('Jumlah pembayaran harus sama dengan total.');
      }

      const receiptNo = await allocateReceiptNumber(database, device.code, input.now);
      const transaction: Transaction = {
        ...newRow(store.id, input.now),
        receiptNo,
        deviceId: device.id,
        shiftId: shift.id,
        cashierId: input.cashier.id,
        customerId: null,
        subtotal: totals.subtotal,
        discountType: input.cart.discount?.type ?? null,
        discountValue: input.cart.discount?.value ?? 0,
        discountAmount: totals.transactionDiscountAmount,
        pricesIncludeTax: store.pricesIncludeTax,
        serviceBps: store.serviceBps,
        serviceAmount: totals.serviceAmount,
        taxBps: store.pb1Bps,
        taxAmount: totals.taxAmount,
        total: totals.total,
        paymentMethod: input.paymentMethod,
        amountPaid: input.amountPaid,
        changeAmount: input.amountPaid - totals.total,
        status: 'paid',
        voidReason: null,
        voidedBy: null,
        voidedAt: null,
      };

      const items: TransactionItem[] = lines.map((resolved, i) => ({
        ...newRow(store.id, input.now),
        transactionId: transaction.id,
        productId: resolved.product.id,
        productName: resolved.product.name,
        variants: resolved.variants,
        qty: resolved.line.qty,
        unitPrice: resolved.unitPrice,
        unitCost: resolved.unitCost,
        discountType: resolved.line.discount?.type ?? null,
        discountValue: resolved.line.discount?.value ?? 0,
        discountAmount: totals.lines[i]!.discountAmount,
        lineTotal: totals.lines[i]!.lineTotal,
        note: resolved.line.note,
      }));

      const movements: StockMovement[] = lines
        .filter((resolved) => resolved.product.trackStock)
        .map((resolved) => ({
          ...newRow(store.id, input.now),
          productId: resolved.product.id,
          type: 'sale',
          qtyDelta: -resolved.line.qty,
          countedQty: null,
          transactionId: transaction.id,
          note: null,
          userId: input.cashier.id,
        }));

      await database.transactions.add(transaction);
      await database.transactionItems.bulkAdd(items);
      if (movements.length) await database.stockMovements.bulkAdd(movements);
      return transaction;
    },
  );
}
