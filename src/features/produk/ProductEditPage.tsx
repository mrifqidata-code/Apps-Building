import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSession, useSignedInUser } from '../../app/session-context';
import {
  ValidationError,
  deleteProduct,
  saveProduct,
  type ProductInput,
  type VariantGroupInput,
} from '../../db/catalog-admin';
import { db } from '../../db/db';
import { saveImage } from '../../db/images';
import type { Category } from '../../db/schema';
import { formatRupiah } from '../../domain/money';
import { nowIso } from '../../domain/time';
import { resizeImage, useImageUrl } from '../../ui/images';
import { Button, ErrorText, Field, FilePickerButton, MoneyInput, inputClass } from '../../ui/kit';
import { errorMessage } from '../../ui/errors';

const PHOTO_MAX_PX = 600;

/** Form state: money fields may be empty while typing. */
interface Draft extends Omit<ProductInput, 'price' | 'cost' | 'groups'> {
  price: number | null;
  cost: number | null;
  groups: (Omit<VariantGroupInput, 'options'> & {
    key: string;
    options: {
      key: string;
      id?: string;
      name: string;
      priceDelta: number | null;
      costDelta: number | null;
    }[];
  })[];
}

const key = () => crypto.randomUUID();

export function ProductEditPage() {
  const { id } = useParams();
  const { store } = useSession();
  const loaded = useLiveQuery(async () => {
    const categories = await db.categories
      .where({ storeId: store.id })
      .filter((c) => !c.deletedAt)
      .sortBy('sortOrder');
    if (!id) return { categories, draft: emptyDraft(categories) };
    const product = await db.products.get(id);
    if (!product || product.deletedAt || product.storeId !== store.id)
      return { categories, draft: null };
    const [groups, options] = await Promise.all([
      db.variantGroups
        .where({ productId: id })
        .filter((g) => !g.deletedAt)
        .sortBy('sortOrder'),
      db.productVariants
        .where({ productId: id })
        .filter((v) => !v.deletedAt)
        .sortBy('sortOrder'),
    ]);
    const draft: Draft = {
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      price: product.price,
      cost: product.cost,
      imageId: product.imageId,
      active: product.active,
      groups: groups.map((g) => ({
        key: g.id,
        id: g.id,
        name: g.name,
        mode: g.mode,
        required: g.required,
        options: options
          .filter((o) => o.groupId === g.id)
          .map((o) => ({
            key: o.id,
            id: o.id,
            name: o.name,
            priceDelta: o.priceDelta,
            costDelta: o.costDelta,
          })),
      })),
    };
    return { categories, draft };
  }, [id, store.id]);

  if (!loaded) return null;
  if (!loaded.draft) return <main className="p-6">Produk tidak ditemukan.</main>;
  return <ProductForm key={id ?? 'new'} initial={loaded.draft} categories={loaded.categories} />;
}

function emptyDraft(categories: Category[]): Draft {
  return {
    categoryId: categories[0]?.id ?? null,
    name: '',
    price: null,
    cost: null,
    imageId: null,
    active: true,
    groups: [],
  };
}

function ProductForm({ initial, categories }: { initial: Draft; categories: Category[] }) {
  const { store, device } = useSession();
  const user = useSignedInUser();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const photoUrl = useImageUrl(draft.imageId);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setGroup = (groupKey: string, patch: Partial<Draft['groups'][number]>) =>
    set({ groups: draft.groups.map((g) => (g.key === groupKey ? { ...g, ...patch } : g)) });

  const margin = draft.price !== null && draft.cost !== null ? draft.price - draft.cost : null;

  const save = async () => {
    setError(null);
    if (draft.price === null) return setError('Harga jual wajib diisi.');
    setSaving(true);
    try {
      await saveProduct(
        db,
        store.id,
        {
          ...draft,
          price: draft.price,
          cost: draft.cost ?? 0,
          groups: draft.groups.map((g) => ({
            ...g,
            options: g.options.map((o) => ({
              id: o.id,
              name: o.name,
              priceDelta: o.priceDelta ?? 0,
              costDelta: o.costDelta ?? 0,
            })),
          })),
        },
        { userId: user.id, deviceId: device.id },
        nowIso(),
      );
      navigate('/produk');
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : errorMessage(e));
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    try {
      const blob = await resizeImage(file, PHOTO_MAX_PX);
      set({ imageId: await saveImage(db, store.id, blob, nowIso()) });
    } catch (e) {
      setError(`Foto gagal diproses: ${errorMessage(e)}`);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => navigate('/produk')}>
          ← Produk
        </Button>
        <h1 className="flex-1 text-xl font-bold">{draft.id ? 'Ubah produk' : 'Produk baru'}</h1>
      </div>

      <Field label="Nama produk">
        <input
          className={inputClass}
          value={draft.name}
          maxLength={60}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>

      <Field label="Kategori">
        <select
          className={inputClass}
          value={draft.categoryId ?? ''}
          onChange={(e) => set({ categoryId: e.target.value || null })}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="">Tanpa kategori</option>
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Harga jual">
          <MoneyInput
            aria-label="Harga jual"
            value={draft.price}
            onChange={(price) => set({ price })}
          />
        </Field>
        <Field label="HPP / modal">
          <MoneyInput aria-label="HPP" value={draft.cost} onChange={(cost) => set({ cost })} />
        </Field>
      </div>
      {margin !== null && (
        <p className={`text-sm ${margin < 0 ? 'text-red-700' : 'text-slate-600'}`}>
          Laba kotor per item: <strong>{formatRupiah(margin)}</strong>
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-700">Foto (opsional)</span>
        <div className="flex flex-wrap items-center gap-3">
          {photoUrl && (
            <img src={photoUrl} alt="Foto produk" className="size-20 rounded-xl object-cover" />
          )}
          <FilePickerButton
            label={draft.imageId ? 'Ganti foto' : 'Pilih foto'}
            onFile={uploadPhoto}
          />
          {draft.imageId && (
            <Button variant="ghost" onClick={() => set({ imageId: null })}>
              Hapus foto
            </Button>
          )}
        </div>
      </div>

      <label className="flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          className="size-6 accent-brand-700"
          checked={draft.active}
          onChange={(e) => set({ active: e.target.checked })}
        />
        <span>
          <span className="font-semibold">Aktif dijual</span>
          <span className="block text-sm text-slate-500">
            Produk nonaktif tidak muncul di layar kasir.
          </span>
        </span>
      </label>

      <section className="flex flex-col gap-3" aria-label="Varian">
        <div>
          <h2 className="text-lg font-semibold">Varian</h2>
          <p className="text-sm text-slate-500">
            Contoh: Ukuran (Reguler, Large) atau Tambahan (Extra Shot, Boba) dengan selisih harga.
          </p>
        </div>
        {draft.groups.map((g) => (
          <div
            key={g.key}
            className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200"
          >
            <div className="flex gap-2">
              <input
                className={inputClass}
                aria-label="Nama varian"
                placeholder="mis. Ukuran"
                value={g.name}
                onChange={(e) => setGroup(g.key, { name: e.target.value })}
              />
              <Button
                variant="danger"
                aria-label={`Hapus varian ${g.name}`}
                onClick={() => set({ groups: draft.groups.filter((x) => x.key !== g.key) })}
              >
                Hapus
              </Button>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  className="size-5 accent-brand-700"
                  checked={g.mode === 'single'}
                  onChange={() => setGroup(g.key, { mode: 'single' })}
                />
                Pilih satu
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  className="size-5 accent-brand-700"
                  checked={g.mode === 'multi'}
                  onChange={() => setGroup(g.key, { mode: 'multi' })}
                />
                Boleh lebih dari satu
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5 accent-brand-700"
                  checked={g.required}
                  onChange={(e) => setGroup(g.key, { required: e.target.checked })}
                />
                Wajib dipilih
              </label>
            </div>
            <ul className="flex flex-col gap-2">
              {g.options.map((o) => {
                const removeOption = (optionKey: string) =>
                  setGroup(g.key, { options: g.options.filter((x) => x.key !== optionKey) });
                const setOption = (patch: Partial<typeof o>) =>
                  setGroup(g.key, {
                    options: g.options.map((x) => (x.key === o.key ? { ...x, ...patch } : x)),
                  });
                return (
                  <li
                    key={o.key}
                    className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 sm:grid-cols-[1fr_8rem_8rem_auto]"
                  >
                    <div className="col-span-2 flex gap-2 sm:col-span-1">
                      <input
                        className={inputClass}
                        aria-label="Nama pilihan"
                        placeholder="mis. Large"
                        value={o.name}
                        onChange={(e) => setOption({ name: e.target.value })}
                      />
                      <button
                        type="button"
                        aria-label={`Hapus pilihan ${o.name}`}
                        className="flex size-12 shrink-0 items-center justify-center rounded-full text-xl text-slate-500 active:bg-slate-100 sm:hidden"
                        onClick={() => removeOption(o.key)}
                      >
                        ×
                      </button>
                    </div>
                    <Field label="+ Harga">
                      <MoneyInput
                        aria-label="Tambahan harga"
                        allowNegative
                        value={o.priceDelta}
                        onChange={(priceDelta) => setOption({ priceDelta })}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="+ HPP">
                      <MoneyInput
                        aria-label="Tambahan HPP"
                        allowNegative
                        value={o.costDelta}
                        onChange={(costDelta) => setOption({ costDelta })}
                        placeholder="0"
                      />
                    </Field>
                    <button
                      type="button"
                      aria-label={`Hapus pilihan ${o.name}`}
                      className="hidden size-12 items-center justify-center self-end rounded-full text-xl text-slate-500 active:bg-slate-100 sm:flex"
                      onClick={() => removeOption(o.key)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button
              variant="ghost"
              onClick={() =>
                setGroup(g.key, {
                  options: [
                    ...g.options,
                    { key: key(), name: '', priceDelta: null, costDelta: null },
                  ],
                })
              }
            >
              + Pilihan
            </Button>
          </div>
        ))}
        <Button
          onClick={() =>
            set({
              groups: [
                ...draft.groups,
                {
                  key: key(),
                  name: '',
                  mode: 'single',
                  required: true,
                  options: [{ key: key(), name: '', priceDelta: null, costDelta: null }],
                },
              ],
            })
          }
        >
          + Tambah varian
        </Button>
      </section>

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-3">
        {draft.id && (
          <Button
            variant="danger"
            onClick={async () => {
              if (
                !window.confirm(`Hapus produk "${draft.name}"? Riwayat penjualan tetap tersimpan.`)
              )
                return;
              await deleteProduct(db, draft.id!, nowIso());
              navigate('/produk');
            }}
          >
            Hapus produk
          </Button>
        )}
        <Button variant="primary" className="flex-1" disabled={saving} onClick={save}>
          Simpan
        </Button>
      </div>
    </main>
  );
}
