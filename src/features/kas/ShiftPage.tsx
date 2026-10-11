import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../app/session-context';
import { db } from '../../db/db';
import type { CashMovementType, Shift } from '../../db/schema';
import { formatRupiah } from '../../domain/money';
import { CASH_MOVEMENT_LABELS, formatCashDifference } from '../../domain/shift';
import { formatJakartaDateTime, jakartaParts } from '../../domain/time';
import { Button } from '../../ui/kit';
import { CashMovementSheet } from './CashMovementSheet';
import { OpenShiftPanel } from './OpenShiftPanel';
import { useOpenShift, useShiftDetails } from './useShift';

const card = 'flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200';

const clock = (at: string) => {
  const { hour, minute } = jakartaParts(at);
  return `${String(hour).padStart(2, '0')}.${String(minute).padStart(2, '0')}`;
};

/** The cash drawer of this device: open it, record kas masuk/keluar, close it. */
export function ShiftPage() {
  const { device } = useSession();
  const shift = useOpenShift(device.id);
  if (shift === undefined) return null;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Kas</h1>
      {shift ? <OpenShift shift={shift} /> : <OpenShiftPanel />}
      <ClosedShifts deviceId={device.id} />
    </main>
  );
}

function OpenShift({ shift }: { shift: Shift }) {
  const { isOwner } = useSession();
  const details = useShiftDetails(shift.id);
  const [sheet, setSheet] = useState<CashMovementType | null>(null);
  if (!details) return null;
  const { summary, movements } = details;

  return (
    <>
      <section aria-label="Kasir sedang buka" className={card}>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900">
            Kasir buka
          </span>
          <span className="text-sm text-slate-600">
            sejak {formatJakartaDateTime(shift.openedAt)} · {details.openedByName}
          </span>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          <dt className="text-slate-600">Modal awal</dt>
          <dd className="text-right font-semibold tabular-nums">
            {formatRupiah(shift.openingCash)}
          </dd>
          <dt className="text-slate-600">Transaksi</dt>
          <dd className="text-right font-semibold tabular-nums">{summary.transactions}</dd>
          {isOwner && (
            <>
              <dt className="text-slate-600">Seharusnya di laci sekarang</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatRupiah(summary.expectedCash)}
              </dd>
            </>
          )}
        </dl>
        {isOwner && (
          <p className="text-sm text-slate-500">
            Angka &quot;seharusnya di laci&quot; hanya terlihat oleh pemilik. Kasir menghitung uang
            dulu saat tutup kasir.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setSheet('out')}>− Kas keluar</Button>
          <Button onClick={() => setSheet('in')}>+ Kas masuk</Button>
        </div>
        <Link
          to="/kas/tutup"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-700 px-4 font-semibold text-white active:bg-brand-800"
        >
          Tutup kasir
        </Link>
      </section>

      <section aria-label="Kas masuk dan keluar" className={card}>
        <h2 className="text-lg font-semibold">Kas masuk/keluar</h2>
        {movements.length === 0 ? (
          <p className="text-slate-500">
            Belum ada. Catat setiap uang yang keluar dari laci selain kembalian, misalnya untuk
            belanja es batu.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {movements.map((m) => (
              <li key={m.id} className="flex min-h-12 items-center gap-3 py-2">
                <span className="w-12 shrink-0 text-sm text-slate-500 tabular-nums">
                  {clock(m.createdAt)}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{m.reason}</span>
                  <span className="text-sm text-slate-500">{CASH_MOVEMENT_LABELS[m.type]}</span>
                </span>
                <span className="font-semibold tabular-nums">
                  {m.type === 'out' ? '−' : '+'}
                  {formatRupiah(m.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet && <CashMovementSheet type={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}

/** The last closings on this device, newest first. */
function ClosedShifts({ deviceId }: { deviceId: string }) {
  const shifts = useLiveQuery(
    async () =>
      (await db.shifts.where('deviceId').equals(deviceId).reverse().sortBy('openedAt'))
        .filter((s) => s.closedAt && !s.deletedAt)
        .slice(0, 10),
    [deviceId],
  );
  if (!shifts?.length) return null;
  return (
    <section aria-label="Riwayat tutup kasir" className={card}>
      <h2 className="text-lg font-semibold">Riwayat tutup kasir</h2>
      <ul className="flex flex-col divide-y divide-slate-100">
        {shifts.map((s) => (
          <li key={s.id}>
            <Link to={`/kas/${s.id}`} className="flex min-h-14 items-center gap-3 py-2">
              <span className="flex-1">
                <span className="block font-semibold">
                  {formatJakartaDateTime(s.openedAt)} – {clock(s.closedAt!)}
                </span>
                <span className="text-sm text-slate-500">
                  Uang fisik {formatRupiah(s.countedCash ?? 0)}
                </span>
              </span>
              <DifferenceBadge difference={s.cashDifference ?? 0} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DifferenceBadge({ difference }: { difference: number }) {
  const tone =
    difference === 0
      ? 'bg-emerald-100 text-emerald-900'
      : difference < 0
        ? 'bg-red-100 text-red-900'
        : 'bg-amber-100 text-amber-900';
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>
      {formatCashDifference(difference)}
    </span>
  );
}
