import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../../app/session-context';
import { formatBps } from '../../domain/money';
import { isDiscountWithinLimit, type Discount } from '../../domain/pricing';
import { Button, ErrorText, Money, Sheet, inputClass } from '../../ui/kit';
import { useCart } from './cart-context';
import { DiscountEditor } from './DiscountEditor';

/** Cart contents with quantity, note and discount editing, plus totals and "Bayar". */
export function CartPanel({ onPay }: { onPay?: () => void }) {
  const { cart, dispatch, priced, pricingError } = useCart();
  const { store, user } = useSession();
  const navigate = useNavigate();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingDiscount, setEditingDiscount] = useState(false);

  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-slate-500">
        <p className="text-lg">Keranjang kosong</p>
        <p className="text-sm">Ketuk produk untuk menambahkannya.</p>
      </div>
    );
  }

  const totals = priced?.totals;
  const overLimit =
    user?.role === 'cashier' &&
    totals &&
    !isDiscountWithinLimit(totals, store.cashierMaxDiscountBps);
  const editing = priced?.lines.find((l) => l.line.key === editingKey);

  return (
    <div className="flex flex-1 flex-col">
      <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto" aria-label="Isi keranjang">
        {(priced?.lines ?? []).map((resolved, i) => {
          const { line } = resolved;
          const lineTotals = totals!.lines[i]!;
          return (
            <li key={line.key} className="flex items-start gap-3 px-4 py-3">
              <button
                type="button"
                className="flex flex-1 flex-col items-start text-left"
                onClick={() => setEditingKey(line.key)}
                aria-label={`Ubah ${resolved.product.name}`}
              >
                <span className="font-semibold">{resolved.product.name}</span>
                {resolved.variants.length > 0 && (
                  <span className="text-sm text-slate-600">
                    {resolved.variants.map((v) => v.name).join(', ')}
                  </span>
                )}
                {line.note && <span className="text-sm text-slate-500 italic">“{line.note}”</span>}
                {lineTotals.discountAmount > 0 && (
                  <span className="text-sm text-emerald-700">
                    Diskon -<Money value={lineTotals.discountAmount} />
                  </span>
                )}
                <Money value={lineTotals.lineTotal} className="mt-1 font-semibold text-teal-800" />
              </button>
              <QtyStepper
                label={resolved.product.name}
                qty={line.qty}
                onChange={(qty) => dispatch({ type: 'setQty', key: line.key, qty })}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 border-t border-slate-200 bg-white p-4">
        <ErrorText>{pricingError}</ErrorText>
        {pricingError && (
          <Button variant="danger" onClick={() => dispatch({ type: 'clear' })}>
            Kosongkan keranjang
          </Button>
        )}
        {totals && (
          <>
            <Row label="Subtotal">
              <Money value={totals.subtotal} />
            </Row>
            <button
              type="button"
              className="flex min-h-10 items-center justify-between text-left text-teal-800"
              onClick={() => setEditingDiscount(true)}
            >
              <span className="font-semibold">
                {cart.discount ? 'Diskon transaksi' : '+ Diskon transaksi'}
              </span>
              {totals.transactionDiscountAmount > 0 && (
                <span className="text-emerald-700">
                  -<Money value={totals.transactionDiscountAmount} />
                </span>
              )}
            </button>
            {!store.pricesIncludeTax && totals.serviceAmount > 0 && (
              <Row label={`Biaya layanan (${formatBps(store.serviceBps)})`}>
                <Money value={totals.serviceAmount} />
              </Row>
            )}
            {!store.pricesIncludeTax && totals.taxAmount > 0 && (
              <Row label={`PB1 (${formatBps(store.pb1Bps)})`}>
                <Money value={totals.taxAmount} />
              </Row>
            )}
            <Row label="Total" strong>
              <Money value={totals.total} />
            </Row>
            {overLimit && (
              <ErrorText>
                Diskon melebihi batas kasir ({formatBps(store.cashierMaxDiscountBps)}). Minta
                pemilik masuk untuk memberi diskon ini.
              </ErrorText>
            )}
            <Button
              variant="primary"
              className="mt-1 w-full text-lg"
              disabled={!!overLimit}
              onClick={() => (onPay ? onPay() : navigate('/bayar'))}
            >
              Bayar · <Money value={totals.total} />
            </Button>
          </>
        )}
      </div>

      {editing && (
        <LineEditorSheet
          key={editing.line.key}
          name={editing.product.name}
          qty={editing.line.qty}
          note={editing.line.note}
          discount={editing.line.discount}
          unitPrice={editing.unitPrice}
          onClose={() => setEditingKey(null)}
          onSave={(changes) => {
            dispatch({ type: 'setNote', key: editing.line.key, note: changes.note });
            dispatch({
              type: 'setLineDiscount',
              key: editing.line.key,
              discount: changes.discount,
            });
            dispatch({ type: 'setQty', key: editing.line.key, qty: changes.qty });
            setEditingKey(null);
          }}
          onRemove={() => {
            dispatch({ type: 'remove', key: editing.line.key });
            setEditingKey(null);
          }}
        />
      )}
      {editingDiscount && totals && (
        <TransactionDiscountSheet
          initial={cart.discount}
          base={totals.subtotal}
          onClose={() => setEditingDiscount(false)}
          onSave={(discount) => {
            dispatch({ type: 'setDiscount', discount });
            setEditingDiscount(false);
          }}
        />
      )}
    </div>
  );
}

function Row({
  label,
  strong = false,
  children,
}: {
  label: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between ${strong ? 'text-xl font-bold' : 'text-slate-700'}`}
    >
      <span>{label}</span>
      {children}
    </div>
  );
}

export function QtyStepper({
  label,
  qty,
  onChange,
}: {
  label: string;
  qty: number;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Kurangi ${label}`}
        onClick={() => onChange(qty - 1)}
        className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-xl font-bold active:bg-slate-200"
      >
        −
      </button>
      <span
        className="w-8 text-center text-lg font-semibold tabular-nums"
        aria-label={`Jumlah ${label}`}
      >
        {qty}
      </span>
      <button
        type="button"
        aria-label={`Tambah ${label}`}
        onClick={() => onChange(qty + 1)}
        className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-xl font-bold active:bg-slate-200"
      >
        +
      </button>
    </div>
  );
}

function LineEditorSheet({
  name,
  qty: initialQty,
  note: initialNote,
  discount: initialDiscount,
  unitPrice,
  onSave,
  onRemove,
  onClose,
}: {
  name: string;
  qty: number;
  note: string | null;
  discount: Discount | null;
  unitPrice: number;
  onSave: (changes: { qty: number; note: string; discount: Discount | null }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(initialQty);
  const [note, setNote] = useState(initialNote ?? '');
  const [discount, setDiscount] = useState(initialDiscount);

  return (
    <Sheet
      title={name}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="danger" onClick={onRemove}>
            Hapus item
          </Button>
          <Button variant="primary" onClick={() => onSave({ qty, note, discount })}>
            Simpan
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Jumlah</span>
          <QtyStepper label={name} qty={qty} onChange={(q) => setQty(Math.max(1, q))} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">Catatan</span>
          <input
            className={inputClass}
            value={note}
            maxLength={80}
            placeholder="mis. kurang manis, tanpa es"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-2">
          <span className="font-semibold">Diskon item</span>
          <DiscountEditor value={discount} onChange={setDiscount} base={unitPrice * qty} />
        </div>
      </div>
    </Sheet>
  );
}

function TransactionDiscountSheet({
  initial,
  base,
  onSave,
  onClose,
}: {
  initial: Discount | null;
  base: number;
  onSave: (discount: Discount | null) => void;
  onClose: () => void;
}) {
  const [discount, setDiscount] = useState(initial);
  return (
    <Sheet
      title="Diskon transaksi"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="danger" onClick={() => onSave(null)}>
            Tanpa diskon
          </Button>
          <Button variant="primary" onClick={() => onSave(discount)}>
            Terapkan
          </Button>
        </div>
      }
    >
      <DiscountEditor value={discount} onChange={setDiscount} base={base} />
    </Sheet>
  );
}
