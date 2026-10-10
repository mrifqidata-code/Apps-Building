import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../../app/session-context';
import { variantGroupsOf } from '../../db/cart';
import type { Product } from '../../db/schema';
import { formatRupiah } from '../../domain/money';
import { useImageUrl } from '../../ui/images';
import { Money, Sheet } from '../../ui/kit';
import { useCart, useCartCount } from './cart-context';
import { CartPanel } from './CartPanel';
import { useCatalog } from './useCatalog';
import { VariantSheet } from './VariantSheet';

const ALL = 'all';

export function KasirPage() {
  const { store } = useSession();
  const catalog = useCatalog(store.id);
  const { dispatch, index, priced } = useCart();
  const navigate = useNavigate();
  const count = useCartCount();
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [choosing, setChoosing] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const products = useMemo(() => {
    if (!catalog) return [];
    if (categoryId === ALL) return catalog.products;
    return catalog.products.filter((p) => p.categoryId === categoryId);
  }, [catalog, categoryId]);

  if (!catalog || !index) return null;

  const tabs = [{ id: ALL, name: 'Semua' }, ...catalog.categories];
  const tapProduct = (product: Product) => {
    if (variantGroupsOf(product.id, index).length > 0) setChoosing(product);
    else dispatch({ type: 'add', productId: product.id });
  };

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-28 lg:pb-4">
        <nav aria-label="Kategori" className="-mx-4 flex shrink-0 gap-2 overflow-x-auto px-4 pb-1">
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
                    ? 'bg-brand-700 text-white'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200'
                }`}
              >
                {tab.name}
              </button>
            );
          })}
        </nav>

        {products.length === 0 ? (
          <p className="p-6 text-center text-slate-500">Belum ada produk di kategori ini.</p>
        ) : (
          <ul
            aria-label="Produk"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4"
          >
            {products.map((product) => (
              <li key={product.id} className="h-full">
                <ProductTile
                  product={product}
                  hasVariants={catalog.productsWithVariants.has(product.id)}
                  onTap={() => tapProduct(product)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tablet/laptop: cart always visible on the right. */}
      <aside
        aria-label="Keranjang"
        className="hidden w-96 shrink-0 flex-col border-l border-slate-200 bg-white lg:flex"
      >
        <h2 className="border-b border-slate-100 px-4 py-3 text-lg font-bold">Keranjang</h2>
        <CartPanel />
      </aside>

      {/* Phone: summary bar at the bottom. */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex min-h-14 flex-1 flex-col items-start justify-center rounded-xl bg-slate-100 px-4 text-left"
          >
            <span className="text-sm text-slate-600">{count} item · Lihat keranjang</span>
            {priced ? (
              <Money value={priced.totals.total} className="text-lg font-bold" />
            ) : (
              <span className="font-bold text-red-700">Periksa keranjang</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/bayar')}
            disabled={!priced}
            className="min-h-14 rounded-xl bg-brand-700 px-6 text-lg font-bold text-white active:bg-brand-800 disabled:bg-slate-300"
          >
            Bayar
          </button>
        </div>
      )}

      {cartOpen && (
        <Sheet title="Keranjang" onClose={() => setCartOpen(false)}>
          <div className="-m-4 flex min-h-[50dvh] flex-col">
            <CartPanel onPay={() => navigate('/bayar')} />
          </div>
        </Sheet>
      )}

      {choosing && (
        <VariantSheet
          product={choosing}
          index={index}
          onClose={() => setChoosing(null)}
          onAdd={(variantIds) => {
            dispatch({ type: 'add', productId: choosing.id, variantIds });
            setChoosing(null);
          }}
        />
      )}
    </div>
  );
}

function ProductTile({
  product,
  hasVariants,
  onTap,
}: {
  product: Product;
  hasVariants: boolean;
  onTap: () => void;
}) {
  const imageUrl = useImageUrl(product.imageId);
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${product.name} ${formatRupiah(product.price)}`}
      className="flex h-full min-h-24 w-full flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-slate-200 active:bg-brand-50 active:ring-brand-600"
    >
      {imageUrl && <img src={imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />}
      <span className="flex flex-1 flex-col justify-between gap-2 p-4">
        <span>
          <span className="block text-base leading-snug font-semibold">{product.name}</span>
          {hasVariants && <span className="text-sm text-slate-500">Ada pilihan</span>}
        </span>
        <span className="text-base font-bold text-brand-800">{formatRupiah(product.price)}</span>
      </span>
    </button>
  );
}
