import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSession } from '../../app/session-context';
import { ValidationError, deleteCategory, saveCategory } from '../../db/catalog-admin';
import { db } from '../../db/db';
import type { Category } from '../../db/schema';
import { formatRupiah } from '../../domain/money';
import { nowIso } from '../../domain/time';
import { Button, ErrorText, Field, Sheet, inputClass } from '../../ui/kit';
import { errorMessage } from '../../ui/errors';

export function ProductListPage() {
  const { store } = useSession();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const [categories, products] = await Promise.all([
      db.categories
        .where({ storeId: store.id })
        .filter((c) => !c.deletedAt)
        .sortBy('sortOrder'),
      db.products
        .where({ storeId: store.id })
        .filter((p) => !p.deletedAt)
        .sortBy('sortOrder'),
    ]);
    return { categories, products };
  }, [store.id]);
  const [editingCategory, setEditingCategory] = useState<Category | 'new' | null>(null);

  if (!data) return null;
  const sections = [
    ...data.categories.map((c) => ({ category: c as Category | null, title: c.name })),
    { category: null, title: 'Tanpa kategori' },
  ]
    .map((s) => ({
      ...s,
      products: data.products.filter((p) => p.categoryId === (s.category?.id ?? null)),
    }))
    .filter((s) => s.category || s.products.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-xl font-bold">Produk</h1>
        <Button onClick={() => setEditingCategory('new')}>+ Kategori</Button>
        <Button variant="primary" onClick={() => navigate('/produk/baru')}>
          + Produk
        </Button>
      </div>

      {sections.map(({ category, title, products }) => (
        <section key={category?.id ?? 'none'} aria-label={title} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-lg font-semibold">{title}</h2>
            {category && (
              <Button variant="ghost" onClick={() => setEditingCategory(category)}>
                Ubah
              </Button>
            )}
          </div>
          {products.length === 0 && <p className="text-sm text-slate-500">Belum ada produk.</p>}
          <ul className="flex flex-col gap-2">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/produk/${p.id}`}
                  className="flex min-h-14 items-center gap-3 rounded-xl bg-white px-4 py-2 ring-1 ring-slate-200 active:bg-slate-50"
                >
                  <span className="flex-1 font-semibold">{p.name}</span>
                  {!p.active && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-600">
                      Nonaktif
                    </span>
                  )}
                  <span className="tabular-nums">{formatRupiah(p.price)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editingCategory && (
        <CategorySheet
          storeId={store.id}
          category={editingCategory === 'new' ? null : editingCategory}
          onClose={() => setEditingCategory(null)}
        />
      )}
    </main>
  );
}

function CategorySheet({
  storeId,
  category,
  onClose,
}: {
  storeId: string;
  category: Category | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : errorMessage(e));
    }
  };

  return (
    <Sheet
      title={category ? 'Ubah kategori' : 'Kategori baru'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          {category && (
            <Button
              variant="danger"
              onClick={() => run(() => deleteCategory(db, category.id, nowIso()))}
            >
              Hapus
            </Button>
          )}
          <Button
            variant="primary"
            className="flex-1"
            onClick={() =>
              run(() => saveCategory(db, storeId, { id: category?.id, name }, nowIso()))
            }
          >
            Simpan
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Nama kategori">
          <input
            className={inputClass}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  );
}
