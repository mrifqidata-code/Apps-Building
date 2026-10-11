import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { formatRupiah } from '../../domain/money';
import { PAYMENT_LABELS, whatsAppShareUrl } from '../../domain/receipt-text';
import { PAYMENT_METHODS } from '../../domain/report';
import {
  CASH_MOVEMENT_LABELS,
  formatCashDifference,
  formatShiftRecapText,
  shiftCashRows,
  type ShiftRecapView,
} from '../../domain/shift';
import { formatJakartaDateTime } from '../../domain/time';
import { printShiftRecap } from '../../printing/receipt-print';
import { isBleSupported, isSerialSupported, printerErrorMessage } from '../../printing/transports';
import { Button, ErrorText } from '../../ui/kit';
import { useShiftDetails } from './useShift';

const card = 'flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200';

/** Rekap tutup kasir: shown right after closing, and from the owner's report. */
export function ShiftRecapPage() {
  const { id } = useParams();
  const details = useShiftDetails(id);
  const navigate = useNavigate();
  const justClosed = (useLocation().state as { justClosed?: boolean } | null)?.justClosed ?? false;

  if (details === undefined) return <main className="p-6 text-slate-500">Memuat…</main>;
  if (details === null) {
    return (
      <main className="mx-auto max-w-md p-6">
        <ErrorText>Data kasir tidak ditemukan.</ErrorText>
      </main>
    );
  }
  const { recap } = details;
  if (!recap) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <h1 className="text-xl font-bold">Rekap kasir</h1>
        <p className="rounded-2xl bg-white p-4 text-slate-600 ring-1 ring-slate-200">
          Kasir {details.deviceLabel} masih buka sejak{' '}
          {formatJakartaDateTime(details.shift.openedAt)}. Rekap muncul setelah kasir ditutup.
        </p>
        <Button onClick={() => navigate(-1)}>← Kembali</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      {justClosed ? (
        <div
          role="status"
          className="rounded-2xl bg-emerald-50 p-4 text-center text-emerald-900 ring-1 ring-emerald-200"
        >
          <p className="text-lg font-bold">Kasir sudah ditutup</p>
          <p className="text-sm">Simpan atau kirim rekap ini ke pemilik.</p>
        </div>
      ) : (
        <h1 className="text-xl font-bold">Rekap tutup kasir</h1>
      )}

      <Difference recap={recap} />

      <section aria-label="Uang tunai" className={card}>
        <h2 className="text-lg font-semibold">Uang tunai</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          {shiftCashRows(recap).map((row) => (
            <Row
              key={row.label}
              label={row.label}
              value={`${row.negative ? '−' : ''}${formatRupiah(row.amount)}`}
              strong={row.kind === 'total'}
            />
          ))}
        </dl>
      </section>

      <section aria-label="Penjualan" className={card}>
        <h2 className="text-lg font-semibold">Penjualan</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          {PAYMENT_METHODS.map((m) => {
            const row = recap.summary.salesByMethod[m];
            return (
              <Row
                key={m}
                label={`${PAYMENT_LABELS[m]} (${row.transactions} transaksi)`}
                value={formatRupiah(row.total)}
              />
            );
          })}
          <Row
            label={`Total (${recap.summary.transactions} transaksi)`}
            value={formatRupiah(recap.summary.totalSales)}
            strong
          />
        </dl>
        {recap.summary.cancelled > 0 && (
          <p className="text-sm text-slate-500">
            {recap.summary.cancelled} transaksi dibatalkan, tidak dihitung.
          </p>
        )}
      </section>

      {recap.movements.length > 0 && (
        <section aria-label="Kas masuk dan keluar" className={card}>
          <h2 className="text-lg font-semibold">Kas masuk/keluar</h2>
          <ul className="flex flex-col divide-y divide-slate-100">
            {recap.movements.map((m, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
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
        </section>
      )}

      <section aria-label="Keterangan" className={`${card} text-sm text-slate-600`}>
        <p>{recap.deviceLabel}</p>
        <p>
          Buka {formatJakartaDateTime(recap.openedAt)} oleh {recap.openedByName}
        </p>
        <p>
          Tutup {formatJakartaDateTime(recap.closedAt)} oleh {recap.closedByName}
        </p>
        {recap.note && <p className="text-slate-800">Catatan: {recap.note}</p>}
      </section>

      <RecapActions recap={recap} />
      <Link
        to="/"
        className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 font-semibold text-brand-800 active:bg-brand-50"
      >
        Selesai
      </Link>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <dt className={strong ? 'font-semibold' : 'text-slate-600'}>{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'font-bold' : ''}`}>{value}</dd>
    </>
  );
}

/** Counted minus expected, the number the owner looks at first. */
function Difference({ recap }: { recap: ShiftRecapView }) {
  const diff = recap.cashDifference;
  const tone =
    diff === 0
      ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
      : diff < 0
        ? 'bg-red-50 text-red-900 ring-red-200'
        : 'bg-amber-50 text-amber-900 ring-amber-200';
  return (
    <section
      aria-label="Selisih kas"
      className={`rounded-2xl p-4 text-center ring-1 ${tone}`}
      data-testid="selisih-kas"
    >
      <p className="text-sm">Selisih uang fisik dengan sistem</p>
      <p className="text-3xl font-bold">{formatCashDifference(diff)}</p>
      <p className="text-sm">
        Seharusnya {formatRupiah(recap.summary.expectedCash)} · fisik{' '}
        {formatRupiah(recap.countedCash)}
      </p>
    </section>
  );
}

function RecapActions({ recap }: { recap: ShiftRecapView }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const canPrint = isBleSupported() || isSerialSupported();

  const print = async () => {
    setState('busy');
    setError(null);
    try {
      await printShiftRecap(recap);
      setState('done');
    } catch (e) {
      setError(printerErrorMessage(e));
      setState('idle');
    }
  };

  return (
    <section aria-label="Bagikan rekap" className="flex flex-col gap-2">
      <div className={`grid gap-2 ${canPrint ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <a
          href={whatsAppShareUrl(formatShiftRecapText(recap))}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-4 font-semibold text-slate-800 ring-1 ring-slate-300 active:bg-slate-100"
        >
          Kirim ke WhatsApp
        </a>
        {canPrint && (
          <Button onClick={print} disabled={state === 'busy'}>
            {state === 'busy' ? 'Mencetak…' : 'Cetak rekap'}
          </Button>
        )}
      </div>
      {state === 'done' && (
        <p role="status" className="text-center text-sm text-emerald-800">
          Rekap terkirim ke printer.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
