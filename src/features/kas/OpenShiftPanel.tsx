import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useSession, useSignedInUser } from '../../app/session-context';
import { db } from '../../db/db';
import { openShift } from '../../db/shift';
import { formatRupiah, type Rupiah } from '../../domain/money';
import { nowIso } from '../../domain/time';
import { errorMessage } from '../../ui/errors';
import { Button, ErrorText, Field, MoneyInput } from '../../ui/kit';

const QUICK_AMOUNTS: Rupiah[] = [0, 100_000, 200_000, 300_000, 500_000];

/** Buka kasir: the cashier counts the starting float in the drawer. */
export function OpenShiftPanel() {
  const { store, device } = useSession();
  const user = useSignedInUser();
  const [amount, setAmount] = useState<Rupiah | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The float used last time on this device is usually the same again.
  const lastOpening = useLiveQuery(
    async () =>
      (await db.shifts.where('deviceId').equals(device.id).reverse().sortBy('openedAt'))[0]
        ?.openingCash ?? null,
    [device.id],
  );
  const quick =
    lastOpening != null && !QUICK_AMOUNTS.includes(lastOpening)
      ? [lastOpening, ...QUICK_AMOUNTS]
      : QUICK_AMOUNTS;

  const submit = async () => {
    if (amount === null) return;
    setBusy(true);
    setError(null);
    try {
      await openShift(db, {
        storeId: store.id,
        deviceId: device.id,
        userId: user.id,
        openingCash: amount,
        now: nowIso(),
      });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Buka kasir"
      className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <div>
        <h2 className="text-xl font-bold">Buka kasir</h2>
        <p className="text-slate-600">
          Hitung uang tunai di laci sebelum mulai berjualan. Saat tutup kasir, jumlah ini jadi dasar
          menghitung uang yang seharusnya ada.
        </p>
      </div>
      <Field label="Modal awal">
        <MoneyInput value={amount} onChange={setAmount} aria-label="Modal awal" placeholder="0" />
      </Field>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pilihan modal awal">
        {quick.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={amount === value}
            onClick={() => setAmount(value)}
            className={`min-h-12 rounded-xl px-2 text-base font-semibold tabular-nums ${
              amount === value
                ? 'bg-brand-50 ring-2 ring-brand-700'
                : 'bg-white ring-1 ring-slate-300'
            }`}
          >
            {formatRupiah(value)}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <Button variant="primary" disabled={amount === null || busy} onClick={submit}>
        {busy ? 'Membuka…' : 'Buka kasir'}
      </Button>
      <p className="text-center text-sm text-slate-500">
        {device.code} · {device.name} · dibuka oleh {user.name}
      </p>
    </section>
  );
}
