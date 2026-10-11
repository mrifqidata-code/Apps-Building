import { useState } from 'react';
import { useSession, useSignedInUser } from '../../app/session-context';
import { db } from '../../db/db';
import type { Product } from '../../db/schema';
import { MAX_STOCK_NOTE_LENGTH, addStockIn, recordStockOpname } from '../../db/stock';
import { nowIso } from '../../domain/time';
import { errorMessage } from '../../ui/errors';
import { Button, ErrorText, Field, Sheet, inputClass } from '../../ui/kit';

/** Whole-number field (pieces/packs); null while empty. */
export function QuantityInput({
  value,
  onChange,
  label,
  autoFocus,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      className={`${inputClass} tabular-nums`}
      inputMode="numeric"
      aria-label={label}
      autoFocus={autoFocus}
      value={value ?? ''}
      placeholder="0"
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
        onChange(digits ? Number(digits) : null);
      }}
    />
  );
}

/** Stok masuk: goods arrived. Any signed-in user. */
export function StockInSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { store } = useSession();
  const user = useSignedInUser();
  const [qty, setQty] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!qty) return;
    setBusy(true);
    setError(null);
    try {
      await addStockIn(db, {
        storeId: store.id,
        productId: product.id,
        qty,
        note,
        userId: user.id,
        now: nowIso(),
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={`Stok masuk: ${product.name}`}
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" disabled={!qty || busy} onClick={save}>
          {busy ? 'Menyimpan…' : 'Simpan stok masuk'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Jumlah masuk">
          <QuantityInput value={qty} onChange={setQty} label="Jumlah masuk" autoFocus />
        </Field>
        <Field label="Catatan (opsional)">
          <input
            className={inputClass}
            value={note}
            maxLength={MAX_STOCK_NOTE_LENGTH}
            placeholder="Misalnya: dari supplier"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  );
}

/** Stok opname: the owner counts the shelf; the count becomes the stock. */
export function OpnameSheet({
  product,
  onHand,
  onClose,
}: {
  product: Product;
  onHand: number;
  onClose: () => void;
}) {
  const { store, device } = useSession();
  const user = useSignedInUser();
  const [counted, setCounted] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const difference = counted === null ? null : counted - onHand;

  const save = async () => {
    if (counted === null) return;
    setBusy(true);
    setError(null);
    try {
      await recordStockOpname(db, {
        storeId: store.id,
        productId: product.id,
        countedQty: counted,
        note,
        actor: { userId: user.id, deviceId: device.id, role: user.role },
        now: nowIso(),
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={`Stok opname: ${product.name}`}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          disabled={counted === null || busy}
          onClick={save}
        >
          {busy ? 'Menyimpan…' : 'Simpan hasil hitung'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-slate-600">
          Stok menurut aplikasi: <strong className="tabular-nums">{onHand}</strong>. Hitung barang
          yang ada, lalu ketik jumlahnya. Hasil hitung menjadi stok yang baru.
        </p>
        <Field label="Hasil hitung">
          <QuantityInput value={counted} onChange={setCounted} label="Hasil hitung" autoFocus />
        </Field>
        {difference !== null && (
          <p
            role="status"
            className={`rounded-xl p-3 text-sm ${
              difference === 0
                ? 'bg-emerald-50 text-emerald-900'
                : difference < 0
                  ? 'bg-red-50 text-red-900'
                  : 'bg-amber-50 text-amber-900'
            }`}
          >
            {difference === 0
              ? 'Cocok dengan aplikasi.'
              : difference < 0
                ? `Selisih ${difference}: ${-difference} hilang, rusak, atau belum tercatat terjual.`
                : `Selisih +${difference}: lebih banyak dari catatan, mungkin ada stok masuk yang belum dicatat.`}
          </p>
        )}
        <Field label="Catatan (opsional)">
          <input
            className={inputClass}
            value={note}
            maxLength={MAX_STOCK_NOTE_LENGTH}
            placeholder="Misalnya: 2 rusak"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  );
}
