import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSession, useSignedInUser } from '../../app/session-context';
import { db } from '../../db/db';
import { MAX_SHIFT_NOTE_LENGTH, closeShift } from '../../db/shift';
import { formatRupiah, type Rupiah } from '../../domain/money';
import { formatJakartaDateTime, nowIso } from '../../domain/time';
import { errorMessage } from '../../ui/errors';
import { Button, ErrorText, Field, MoneyInput, Sheet, inputClass } from '../../ui/kit';
import { useOpenShift } from './useShift';

/**
 * Tutup kasir. The cashier counts the drawer and types the amount first;
 * what the system expected only appears afterwards, on the recap.
 */
export function CloseShiftPage() {
  const { device } = useSession();
  const user = useSignedInUser();
  const shift = useOpenShift(device.id);
  const navigate = useNavigate();
  const [counted, setCounted] = useState<Rupiah | null>(null);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (shift === undefined) return null;
  if (shift === null) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
        <h1 className="text-xl font-bold">Tutup kasir</h1>
        <p className="rounded-2xl bg-white p-4 text-slate-600 ring-1 ring-slate-200">
          Kasir di HP ini belum dibuka.
        </p>
        <Link to="/kas" className="font-semibold text-brand-800 underline">
          Ke halaman Kas
        </Link>
      </main>
    );
  }

  const close = async () => {
    if (counted === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await closeShift(db, {
        shiftId: shift.id,
        userId: user.id,
        countedCash: counted,
        note,
        now: nowIso(),
      });
      navigate(`/kas/${result.shift.id}`, { replace: true, state: { justClosed: true } });
    } catch (e) {
      setError(errorMessage(e));
      setConfirming(false);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => navigate('/kas')} aria-label="Kembali ke Kas">
          ← Kembali
        </Button>
        <h1 className="flex-1 text-xl font-bold">Tutup kasir</h1>
      </div>

      <section className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">
          Dibuka {formatJakartaDateTime(shift.openedAt)}, modal awal{' '}
          {formatRupiah(shift.openingCash)}.
        </p>
        <ol className="list-decimal pl-5 text-slate-700">
          <li>Hitung semua uang tunai di laci, termasuk modal awal.</li>
          <li>Ketik jumlahnya di bawah.</li>
          <li>Angka menurut sistem dan selisihnya muncul setelah disimpan.</li>
        </ol>
        <Field label="Uang fisik di laci">
          <MoneyInput
            value={counted}
            onChange={setCounted}
            aria-label="Uang fisik di laci"
            placeholder="0"
          />
        </Field>
        <Field label="Catatan (opsional)" hint="Misalnya alasan kalau ada uang yang terpakai.">
          <textarea
            className={`${inputClass} min-h-20 py-2`}
            value={note}
            maxLength={MAX_SHIFT_NOTE_LENGTH}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button variant="primary" disabled={counted === null} onClick={() => setConfirming(true)}>
          Simpan dan tutup kasir
        </Button>
      </section>

      {confirming && counted !== null && (
        <Sheet
          title="Tutup kasir?"
          onClose={() => setConfirming(false)}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setConfirming(false)}>Periksa lagi</Button>
              <Button variant="primary" disabled={busy} onClick={close}>
                {busy ? 'Menyimpan…' : 'Ya, tutup kasir'}
              </Button>
            </div>
          }
        >
          <p>
            Uang fisik di laci: <strong className="tabular-nums">{formatRupiah(counted)}</strong>.
          </p>
          <p className="mt-2 text-slate-600">
            Setelah ditutup, jumlah ini tidak bisa diubah. Untuk berjualan lagi, buka kasir baru.
          </p>
        </Sheet>
      )}
    </main>
  );
}
