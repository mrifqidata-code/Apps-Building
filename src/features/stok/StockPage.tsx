import { useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../app/session-context';
import type { Product } from '../../db/schema';
import { toCsv } from '../../domain/csv';
import { formatStock } from '../../domain/stock';
import { jakartaDateKey, nowIso } from '../../domain/time';
import { Button } from '../../ui/kit';
import { downloadCsv } from '../laporan/download';
import { OpnameSheet, StockInSheet } from './StockSheets';
import { STOCK_STATUS_LABELS, STOCK_TONE, useStockRows } from './useStock';

type Action = { kind: 'in' | 'opname'; product: Product; onHand: number };

/** Products that track stock: what is left, stok masuk, and (owner) stok opname. */
export function StockPage() {
  const { store, isOwner } = useSession();
  const rows = useStockRows(store.id);
  const [action, setAction] = useState<Action | null>(null);
  if (!rows) return null;

  const exportCsv = () =>
    downloadCsv(
      `reqap-stok-${jakartaDateKey(nowIso())}.csv`,
      toCsv(
        ['Produk', 'Stok', 'Batas menipis', 'Status'],
        rows.map((r) => [
          r.product.name,
          r.onHand,
          r.product.lowStockThreshold,
          STOCK_STATUS_LABELS[r.status],
        ]),
      ),
    );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Stok</h1>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-slate-600 ring-1 ring-slate-200">
          Belum ada produk yang dilacak stoknya. Pemilik bisa menyalakan &quot;Lacak stok&quot; di
          halaman Produk, misalnya untuk frozen food atau barang kemasan.
        </p>
      ) : (
        <ul aria-label="Daftar stok" className="flex flex-col gap-2">
          {rows.map(({ product, onHand, status }) => (
            <li
              key={product.id}
              className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200"
            >
              <div className="flex items-center gap-3">
                <Link
                  to={`/stok/${product.id}`}
                  className="flex min-h-12 min-w-0 flex-1 flex-col justify-center"
                >
                  <span className="font-semibold">{product.name}</span>
                  <span className="text-sm text-slate-500">Lihat riwayat</span>
                </Link>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${STOCK_TONE[status]}`}
                >
                  {formatStock(onHand, product.lowStockThreshold)}
                </span>
              </div>
              <div className={`grid gap-2 ${isOwner ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <Button
                  aria-label={`Stok masuk ${product.name}`}
                  onClick={() => setAction({ kind: 'in', product, onHand })}
                >
                  + Stok masuk
                </Button>
                {isOwner && (
                  <Button
                    aria-label={`Opname ${product.name}`}
                    onClick={() => setAction({ kind: 'opname', product, onHand })}
                  >
                    Opname
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!isOwner && rows.length > 0 && (
        <p className="text-sm text-slate-500">
          Stok opname (menghitung ulang stok) dilakukan oleh pemilik.
        </p>
      )}
      {isOwner && rows.length > 0 && (
        <Button onClick={exportCsv} className="self-start">
          Ekspor CSV stok
        </Button>
      )}

      {action?.kind === 'in' && (
        <StockInSheet product={action.product} onClose={() => setAction(null)} />
      )}
      {action?.kind === 'opname' && (
        <OpnameSheet
          product={action.product}
          onHand={action.onHand}
          onClose={() => setAction(null)}
        />
      )}
    </main>
  );
}
