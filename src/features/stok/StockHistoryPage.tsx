import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useSession } from '../../app/session-context';
import { db } from '../../db/db';
import { formatStock, stockOnHand, stockStatus, STOCK_MOVEMENT_LABELS } from '../../domain/stock';
import { formatJakartaDateTime } from '../../domain/time';
import { Button } from '../../ui/kit';
import { OpnameSheet, StockInSheet } from './StockSheets';
import { STOCK_TONE } from './useStock';

const SHOWN = 100;

/** One product's stock movements, newest first. */
export function StockHistoryPage() {
  const { id } = useParams();
  const { store, isOwner } = useSession();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'in' | 'opname' | null>(null);
  const data = useLiveQuery(async () => {
    const product = id ? await db.products.get(id) : undefined;
    if (!product || product.storeId !== store.id || product.deletedAt) return null;
    const [movements, users] = await Promise.all([
      db.stockMovements
        .where('productId')
        .equals(product.id)
        .filter((m) => m.deletedAt === null)
        .toArray(),
      db.users.where({ storeId: store.id }).toArray(),
    ]);
    const sorted = movements.sort((a, b) =>
      b.createdAt === a.createdAt
        ? b.id.localeCompare(a.id)
        : b.createdAt.localeCompare(a.createdAt),
    );
    return {
      product,
      onHand: stockOnHand(movements),
      movements: sorted,
      userName: new Map(users.map((u) => [u.id, u.name])),
    };
  }, [id, store.id]);

  if (data === undefined) return null;
  if (data === null) return <main className="p-6">Produk tidak ditemukan.</main>;
  const { product, onHand, movements, userName } = data;
  const status = stockStatus(onHand, product.lowStockThreshold);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => navigate('/stok')} aria-label="Kembali ke Stok">
          ← Stok
        </Button>
        <h1 className="flex-1 truncate text-xl font-bold">{product.name}</h1>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 font-semibold tabular-nums ${STOCK_TONE[status]}`}
            data-testid="stok-sekarang"
          >
            {formatStock(onHand, product.lowStockThreshold)}
          </span>
          <span className="text-sm text-slate-500">
            {product.trackStock
              ? product.lowStockThreshold !== null
                ? `Menipis di ${product.lowStockThreshold} atau kurang`
                : 'Tanpa batas menipis'
              : 'Stok tidak dilacak lagi'}
          </span>
        </div>
        {product.trackStock && (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setSheet('in')}>+ Stok masuk</Button>
            {isOwner && <Button onClick={() => setSheet('opname')}>Stok opname</Button>}
          </div>
        )}
      </section>

      <section aria-label="Riwayat stok" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Riwayat</h2>
        {movements.length === 0 && <p className="text-slate-500">Belum ada catatan stok.</p>}
        <ul className="flex flex-col divide-y divide-slate-100 rounded-2xl bg-white px-4 ring-1 ring-slate-200">
          {movements.slice(0, SHOWN).map((m) => {
            const label =
              m.type === 'opname' && m.countedQty !== null
                ? `Dihitung ${m.countedQty}`
                : STOCK_MOVEMENT_LABELS[m.type];
            const delta = `${m.qtyDelta > 0 ? '+' : ''}${m.qtyDelta}`;
            return (
              <li key={m.id} className="flex min-h-14 items-center gap-3 py-2">
                <span className="flex-1">
                  <span className="block font-semibold">
                    {m.type === 'sale' && m.transactionId ? (
                      <Link to={`/struk/${m.transactionId}`} className="underline">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </span>
                  <span className="text-sm text-slate-500">
                    {formatJakartaDateTime(m.createdAt)}
                    {m.userId ? ` · ${userName.get(m.userId) ?? '-'}` : ''}
                    {m.note ? ` · ${m.note}` : ''}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {m.type === 'opname' ? (m.qtyDelta === 0 ? 'cocok' : `selisih ${delta}`) : delta}
                </span>
              </li>
            );
          })}
        </ul>
        {movements.length > SHOWN && (
          <p className="text-sm text-slate-500">Menampilkan {SHOWN} catatan terbaru.</p>
        )}
      </section>

      {sheet === 'in' && <StockInSheet product={product} onClose={() => setSheet(null)} />}
      {sheet === 'opname' && (
        <OpnameSheet product={product} onHand={onHand} onClose={() => setSheet(null)} />
      )}
    </main>
  );
}
