import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { useSession } from '../../app/session-context';
import { db } from '../../db/db';
import { formatRupiah } from '../../domain/money';
import { PAYMENT_LABELS } from '../../domain/receipt-text';
import { jakartaDateKey, jakartaDayRange, jakartaParts, nowIso } from '../../domain/time';

const STATUS_LABEL = { paid: null, void: 'Dibatalkan', refunded: 'Direfund' } as const;

/** Today's sales on this store (WIB day), newest first. */
export function HistoryPage() {
  const { store } = useSession();
  const today = jakartaDateKey(nowIso());
  const transactions = useLiveQuery(
    () =>
      db.transactions
        .where('createdAt')
        .between(...jakartaDayRange(today), true, false)
        .filter((t) => t.storeId === store.id)
        .reverse()
        .toArray(),
    [store.id, today],
  );
  const paid = transactions?.filter((t) => t.status === 'paid') ?? [];
  const total = paid.reduce((sum, t) => sum + t.total, 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Riwayat hari ini</h1>
        <p className="text-slate-600">
          {paid.length} transaksi · <strong>{formatRupiah(total)}</strong>
        </p>
      </div>
      {transactions && transactions.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          Belum ada transaksi hari ini.
        </p>
      )}
      <ul className="flex flex-col gap-2" aria-label="Transaksi">
        {transactions?.map((t) => {
          const { hour, minute } = jakartaParts(t.createdAt);
          return (
            <li key={t.id}>
              <Link
                to={`/struk/${t.id}`}
                className="flex min-h-16 items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200 active:bg-slate-50"
              >
                <span className="flex flex-1 flex-col">
                  <span className="font-semibold">{t.receiptNo}</span>
                  <span className="text-sm text-slate-600">
                    {String(hour).padStart(2, '0')}.{String(minute).padStart(2, '0')} ·{' '}
                    {PAYMENT_LABELS[t.paymentMethod]}
                    {STATUS_LABEL[t.status] && (
                      <span className="text-red-700"> · {STATUS_LABEL[t.status]}</span>
                    )}
                  </span>
                </span>
                <span className="font-bold tabular-nums">{formatRupiah(t.total)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
