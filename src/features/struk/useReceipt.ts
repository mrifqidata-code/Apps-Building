import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Transaction } from '../../db/schema';
import type { ReceiptView } from '../../domain/receipt-text';

/** Loads everything a receipt shows. undefined = loading, null = not found. */
export function useReceipt(transactionId: string | undefined): ReceiptView | null | undefined {
  return useLiveQuery(async () => {
    if (!transactionId) return null;
    const transaction = await db.transactions.get(transactionId);
    if (!transaction) return null;
    return buildReceiptView(transaction);
  }, [transactionId]);
}

export async function buildReceiptView(transaction: Transaction): Promise<ReceiptView> {
  const [store, cashier, items] = await Promise.all([
    db.stores.get(transaction.storeId),
    db.users.get(transaction.cashierId),
    db.transactionItems.where({ transactionId: transaction.id }).sortBy('id'),
  ]);
  return {
    storeName: store?.name ?? '',
    storeAddress: store?.address ?? '',
    storePhone: store?.phone ?? '',
    footer: store?.receiptFooter ?? '',
    receiptNo: transaction.receiptNo,
    createdAt: transaction.createdAt,
    cashierName: cashier?.name ?? '-',
    lines: items.map((item) => ({
      name: item.productName,
      variantNames: item.variants.map((v) => v.name),
      qty: item.qty,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      lineTotal: item.lineTotal,
      note: item.note,
    })),
    subtotal: transaction.subtotal,
    // Line discounts are shown on their lines; this is the transaction-level discount.
    discountAmount: transaction.discountAmount,
    pricesIncludeTax: transaction.pricesIncludeTax,
    serviceBps: transaction.serviceBps,
    serviceAmount: transaction.serviceAmount,
    taxBps: transaction.taxBps,
    taxAmount: transaction.taxAmount,
    total: transaction.total,
    paymentMethod: transaction.paymentMethod,
    amountPaid: transaction.amountPaid,
    changeAmount: transaction.changeAmount,
    status: transaction.status,
  };
}
