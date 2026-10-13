import type { IsoDateTime } from '../domain/time';
import type { PosDatabase } from './db';
import { newRow, touched } from './rows';
import { getOpenShift } from './shift';
import type { AuditLogEntry, CashMovement, StockMovement, Transaction, UserRole } from './schema';

/**
 * Cancelling a sale. Owner only, always with a reason, always in the audit
 * log; nothing is ever deleted (the transaction's status moves forward once).
 *
 * - void: the sale's shift is still open. The money never stayed in the
 *   drawer (the shift recap simply leaves the sale out) and the goods go
 *   back to stock.
 * - refund: the sale's shift was closed. A cash refund is paid from the
 *   drawer that is open on this phone, so it is recorded there as kas keluar.
 *   The goods go back to stock only when asked (they may be eaten or broken).
 */

export class CancelError extends Error {}

export type CancelKind = 'void' | 'refund';

export const MAX_CANCEL_REASON_LENGTH = 120;

export interface CancelPlan {
  kind: CancelKind;
  /** Pieces of tracked products the sale took out of stock. */
  stockQty: number;
  /** A cash refund that will be taken from this phone's open drawer, or null. */
  cashFromDrawer: { amount: number; shiftId: string } | null;
}

/** What cancelling this sale on this device would do, for the confirmation screen. */
export async function planCancel(
  database: PosDatabase,
  transaction: Transaction,
  deviceId: string,
): Promise<CancelPlan> {
  const [shift, sold] = await Promise.all([
    transaction.shiftId ? database.shifts.get(transaction.shiftId) : undefined,
    saleMovements(database, transaction.id),
  ]);
  const kind: CancelKind = shift && shift.closedAt === null ? 'void' : 'refund';
  let cashFromDrawer: CancelPlan['cashFromDrawer'] = null;
  if (kind === 'refund' && transaction.paymentMethod === 'cash') {
    const open = await getOpenShift(database, deviceId);
    if (open) cashFromDrawer = { amount: transaction.total, shiftId: open.id };
  }
  return { kind, stockQty: sold.reduce((sum, m) => sum - m.qtyDelta, 0), cashFromDrawer };
}

/** The stock a sale took out, found through its items' products (movements are indexed by product). */
async function saleMovements(database: PosDatabase, transactionId: string) {
  const items = await database.transactionItems
    .where('transactionId')
    .equals(transactionId)
    .toArray();
  const productIds = [...new Set(items.map((i) => i.productId))];
  return database.stockMovements
    .where('productId')
    .anyOf(productIds)
    .filter((m) => m.transactionId === transactionId && m.type === 'sale' && !m.deletedAt)
    .toArray();
}

export interface CancelInput {
  transactionId: string;
  reason: string;
  /** Refund only: put the goods back into stock (a void always does). */
  restock: boolean;
  /** Who approved it: the owner, signed in or with the owner PIN on this phone. */
  actor: { userId: string; role: UserRole };
  deviceId: string;
  now: IsoDateTime;
}

export interface CancelResult {
  transaction: Transaction;
  kind: CancelKind;
  restocked: StockMovement[];
  cashOut: CashMovement | null;
}

export async function cancelSale(database: PosDatabase, input: CancelInput): Promise<CancelResult> {
  if (input.actor.role !== 'owner') {
    throw new CancelError('Hanya pemilik yang bisa membatalkan transaksi.');
  }
  const reason = input.reason.trim();
  if (!reason) throw new CancelError('Tulis alasan pembatalan.');
  if (reason.length > MAX_CANCEL_REASON_LENGTH) {
    throw new CancelError(`Alasan maksimal ${MAX_CANCEL_REASON_LENGTH} karakter.`);
  }

  return database.transaction(
    'rw',
    [
      database.transactions,
      database.transactionItems,
      database.shifts,
      database.stockMovements,
      database.cashMovements,
      database.auditLog,
    ],
    async () => {
      const before = await database.transactions.get(input.transactionId);
      if (!before || before.deletedAt) throw new CancelError('Transaksi tidak ditemukan.');
      if (before.status !== 'paid') throw new CancelError('Transaksi ini sudah dibatalkan.');

      const plan = await planCancel(database, before, input.deviceId);
      const status = plan.kind === 'void' ? 'void' : 'refunded';
      const transaction: Transaction = {
        ...before,
        ...touched(input.now),
        status,
        voidReason: reason,
        voidedBy: input.actor.userId,
        voidedAt: input.now,
      };
      await database.transactions.put(transaction);

      const label = plan.kind === 'void' ? 'Void' : 'Refund';
      const restocked: StockMovement[] =
        plan.kind === 'void' || input.restock
          ? (await saleMovements(database, before.id)).map((sale) => ({
              ...newRow(before.storeId, input.now),
              productId: sale.productId,
              type: 'void_return',
              qtyDelta: -sale.qtyDelta,
              countedQty: null,
              transactionId: before.id,
              note: `${label} ${before.receiptNo}`,
              userId: input.actor.userId,
            }))
          : [];
      if (restocked.length) await database.stockMovements.bulkAdd(restocked);

      let cashOut: CashMovement | null = null;
      if (plan.cashFromDrawer) {
        cashOut = {
          ...newRow(before.storeId, input.now),
          shiftId: plan.cashFromDrawer.shiftId,
          deviceId: input.deviceId,
          type: 'out',
          amount: plan.cashFromDrawer.amount,
          reason: `Refund ${before.receiptNo}`,
          userId: input.actor.userId,
        };
        await database.cashMovements.add(cashOut);
      }

      const audit: AuditLogEntry = {
        ...newRow(before.storeId, input.now),
        actorId: input.actor.userId,
        deviceId: input.deviceId,
        action: plan.kind === 'void' ? 'void' : 'refund',
        entity: 'transaction',
        entityId: before.id,
        before: { status: before.status, total: before.total, receiptNo: before.receiptNo },
        after: {
          status,
          restockedQty: restocked.reduce((sum, m) => sum + m.qtyDelta, 0),
          cashFromDrawer: cashOut?.amount ?? 0,
        },
        reason,
      };
      await database.auditLog.add(audit);

      return { transaction, kind: plan.kind, restocked, cashOut };
    },
  );
}
