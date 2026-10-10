import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useSession, useSignedInUser } from '../../app/session-context';
import { CartError } from '../../db/cart';
import { completeSale } from '../../db/checkout';
import { db } from '../../db/db';
import type { PaymentMethod } from '../../db/schema';
import { changeFor, suggestCashAmounts } from '../../domain/cash';
import { formatRupiah, type Rupiah } from '../../domain/money';
import { PAYMENT_LABELS } from '../../domain/receipt-text';
import { nowIso } from '../../domain/time';
import { useImageUrl } from '../../ui/images';
import { Button, ErrorText, Money, MoneyInput } from '../../ui/kit';
import { errorMessage } from '../../ui/errors';
import { useCart } from '../kasir/cart-context';

const METHODS: PaymentMethod[] = ['cash', 'qris', 'transfer'];

export function PaymentPage() {
  const { store, device } = useSession();
  const user = useSignedInUser();
  const { cart, dispatch, priced, pricingError } = useCart();
  const navigate = useNavigate();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cash, setCash] = useState<Rupiah | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const qrisUrl = useImageUrl(store.qrisImageId);

  // Checked before the empty-cart redirect: the cart is cleared right after saving.
  if (savedId) return <Navigate to={`/struk/${savedId}`} replace state={{ justPaid: true }} />;
  if (cart.lines.length === 0) return <Navigate to="/" replace />;
  if (!priced) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <ErrorText>{pricingError ?? 'Memuat…'}</ErrorText>
        <Button onClick={() => navigate('/')}>← Kembali ke kasir</Button>
      </main>
    );
  }

  const total = priced.totals.total;
  const paid = method === 'cash' ? cash : total;
  const change = method === 'cash' && cash !== null ? changeFor(total, cash) : 0;
  const canFinish = paid !== null && paid >= total && !saving;

  const finish = async () => {
    if (paid === null) return;
    setSaving(true);
    setError(null);
    try {
      const transaction = await completeSale(db, {
        storeId: store.id,
        deviceId: device.id,
        cashier: { id: user.id, role: user.role },
        cart,
        paymentMethod: method,
        amountPaid: paid,
        now: nowIso(),
      });
      setSavedId(transaction.id);
      dispatch({ type: 'clear' });
    } catch (e) {
      setError(e instanceof CartError ? e.message : `Gagal menyimpan: ${errorMessage(e)}`);
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => navigate('/')} aria-label="Kembali ke kasir">
          ← Kembali
        </Button>
        <h1 className="flex-1 text-xl font-bold">Pembayaran</h1>
      </div>

      <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-slate-600">Total bayar</p>
        <p className="text-4xl font-bold tabular-nums" data-testid="total-bayar">
          {formatRupiah(total)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Metode bayar">
        {METHODS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={method === m}
            onClick={() => {
              setMethod(m);
              setError(null);
            }}
            className={`min-h-14 rounded-xl text-lg font-semibold ${
              method === m ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-300'
            }`}
          >
            {PAYMENT_LABELS[m]}
          </button>
        ))}
      </div>

      {method === 'cash' && (
        <section className="flex flex-col gap-3" aria-label="Uang tunai">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[total, ...suggestCashAmounts(total)].map((amount, i) => (
              <button
                key={amount}
                type="button"
                aria-pressed={cash === amount}
                onClick={() => setCash(amount)}
                className={`min-h-14 rounded-xl text-lg font-semibold tabular-nums ${
                  cash === amount
                    ? 'bg-brand-50 ring-2 ring-brand-700'
                    : 'bg-white ring-1 ring-slate-300'
                }`}
              >
                {i === 0 ? 'Uang pas' : formatRupiah(amount)}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Nominal lain</span>
            <MoneyInput
              aria-label="Uang diterima"
              value={cash}
              onChange={setCash}
              placeholder="0"
            />
          </label>
          {cash !== null && (
            <div
              className={`flex items-center justify-between rounded-xl px-4 py-3 text-lg font-bold ${
                change < 0 ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'
              }`}
              data-testid="kembalian"
            >
              <span>{change < 0 ? 'Kurang' : 'Kembalian'}</span>
              <Money value={Math.abs(change)} />
            </div>
          )}
        </section>
      )}

      {method === 'qris' && (
        <section className="flex flex-col items-center gap-3 text-center" aria-label="QRIS">
          {qrisUrl ? (
            <img
              src={qrisUrl}
              alt="QRIS toko"
              className="max-h-[50dvh] w-auto max-w-full rounded-xl bg-white object-contain ring-1 ring-slate-200"
            />
          ) : (
            <p className="rounded-xl bg-amber-50 p-4 text-amber-900">
              Gambar QRIS belum diunggah. Pemilik bisa mengunggahnya di menu Pengaturan.
            </p>
          )}
          <p className="text-slate-600">
            Minta pelanggan memindai QRIS dan membayar <strong>{formatRupiah(total)}</strong>.
            Pastikan pembayaran sudah masuk sebelum menekan tombol di bawah.
          </p>
        </section>
      )}

      {method === 'transfer' && (
        <p className="rounded-xl bg-white p-4 text-slate-700 ring-1 ring-slate-200">
          Pastikan transfer sebesar <strong>{formatRupiah(total)}</strong> sudah masuk ke rekening
          toko sebelum menekan tombol di bawah.
        </p>
      )}

      <ErrorText>{error}</ErrorText>
      {/* Stays on screen so the cashier never has to scroll to finish. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col bg-slate-50 px-4 pt-2 pb-4">
        <Button
          variant="primary"
          className="min-h-16 text-xl"
          disabled={!canFinish}
          onClick={finish}
        >
          {method === 'cash'
            ? 'Selesaikan'
            : method === 'qris'
              ? 'Pembayaran QRIS diterima'
              : 'Transfer sudah diterima'}
        </Button>
      </div>
    </main>
  );
}
