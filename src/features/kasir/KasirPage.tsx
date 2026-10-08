import { useMemo, useState } from 'react';
import { formatRupiah } from '../../domain/money';
import { useCatalog } from './useCatalog';

const ALL = 'all';

export function KasirPage({ storeId }: { storeId: string }) {
  const catalog = useCatalog(storeId);
  const [categoryId, setCategoryId] = useState<string>(ALL);

  const products = useMemo(() => {
    if (!catalog) return [];
    if (categoryId === ALL) return catalog.products;
    return catalog.products.filter((p) => p.categoryId === categoryId);
  }, [catalog, categoryId]);

  if (!catalog) return null;

  const tabs = [{ id: ALL, name: 'Semua' }, ...catalog.categories];

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Versi fondasi (M0): katalog demo saja. Keranjang dan pembayaran hadir di M1.
      </p>

      <nav aria-label="Kategori" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((tab) => {
          const selected = tab.id === categoryId;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setCategoryId(tab.id)}
              className={`min-h-12 shrink-0 rounded-full px-5 text-base font-semibold ${
                selected
                  ? 'bg-teal-700 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
            >
              {tab.name}
            </button>
          );
        })}
      </nav>

      <ul
        aria-label="Produk"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {products.map((product) => (
          <li key={product.id} className="h-full">
            <div className="flex h-full min-h-24 flex-col justify-between gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <span>
                <span className="block text-base leading-snug font-semibold">{product.name}</span>
                {catalog.productsWithVariants.has(product.id) && (
                  <span className="text-sm text-slate-500">Ada pilihan</span>
                )}
              </span>
              <span className="text-base font-bold text-teal-800">
                {formatRupiah(product.price)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
