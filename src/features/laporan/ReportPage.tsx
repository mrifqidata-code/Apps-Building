import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../app/session-context';
import { useCloudLink } from '../../cloud/hooks';
import { useSyncStatus } from '../../cloud/sync-manager';
import { divRound, formatBps, formatRupiah, ratioBps } from '../../domain/money';
import {
  formatDayShort,
  formatPeriod,
  movePeriod,
  periodContaining,
  periodFileLabel,
  weekdayShort,
  type Period,
  type PeriodKind,
} from '../../domain/period';
import { PAYMENT_LABELS } from '../../domain/receipt-text';
import type { SalesReport } from '../../domain/report';
import {
  cashMovementsCsv,
  itemsCsv,
  productsCsv,
  shiftsCsv,
  transactionsCsv,
} from '../../domain/report-csv';
import { formatJakartaDateTime, jakartaDateKey, jakartaParts, nowIso } from '../../domain/time';
import { DifferenceBadge } from '../kas/ShiftPage';
import { downloadCsv } from './download';
import { HourChart } from './HourChart';
import { useReportData, type ReportData } from './useReportData';

const card = 'flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200';

const KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: 'day', label: 'Harian' },
  { kind: 'week', label: 'Mingguan' },
  { kind: 'month', label: 'Bulanan' },
];

const PRODUCTS_SHOWN = 10;

const clock = (at: string) => {
  const { hour, minute } = jakartaParts(at);
  return `${String(hour).padStart(2, '0')}.${String(minute).padStart(2, '0')}`;
};

/** Sales, gross profit, busiest hours and closings for a day, week or month (owner only). */
export function ReportPage() {
  const { store } = useSession();
  const today = jakartaDateKey(nowIso());
  const [period, setPeriod] = useState<Period>(() => periodContaining('day', today));
  const data = useReportData(store.id, period);
  const isLatest = period.end >= today;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Laporan</h1>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Jenis laporan">
        {KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={period.kind === kind}
            onClick={() => setPeriod(periodContaining(kind, today))}
            className={`min-h-12 rounded-xl font-semibold ${
              period.kind === kind ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Periode sebelumnya"
          onClick={() => setPeriod(movePeriod(period, -1))}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white text-xl ring-1 ring-slate-300"
        >
          ‹
        </button>
        <p className="flex-1 text-center text-lg font-semibold" data-testid="periode">
          {formatPeriod(period)}
        </p>
        <button
          type="button"
          aria-label="Periode berikutnya"
          disabled={isLatest}
          onClick={() => setPeriod(movePeriod(period, 1))}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white text-xl ring-1 ring-slate-300 disabled:text-slate-300"
        >
          ›
        </button>
      </div>
      <SyncNote />

      {data === undefined ? (
        <p className="p-6 text-center text-slate-500">Menghitung…</p>
      ) : (
        <ReportBody data={data} period={period} />
      )}
    </main>
  );
}

/** Reports only include what has reached this device. */
function SyncNote() {
  const link = useCloudLink();
  const status = useSyncStatus();
  if (!link) return null;
  return (
    <p className="text-sm text-slate-500">
      Termasuk transaksi dari semua HP yang sudah tersinkron
      {status.lastSyncAt ? ` (terakhir ${formatJakartaDateTime(status.lastSyncAt)})` : ''}.
    </p>
  );
}

function ReportBody({ data, period }: { data: ReportData; period: Period }) {
  const { report } = data;
  const t = report.totals;
  const margin = ratioBps(t.grossProfit, t.netSales);

  return (
    <>
      <section aria-label="Ringkasan" className="grid grid-cols-2 gap-2">
        <Tile label="Penjualan bersih" value={formatRupiah(t.netSales)} testId="penjualan-bersih" />
        <Tile
          label="Laba kotor"
          value={formatRupiah(t.grossProfit)}
          detail={margin === null ? undefined : `Margin ${formatBps(margin)}`}
          testId="laba-kotor"
        />
        <Tile
          label="Transaksi"
          value={String(t.transactions)}
          detail={
            t.transactions
              ? `Rata-rata ${formatRupiah(divRound(t.totalReceived, t.transactions))}`
              : undefined
          }
          testId="jumlah-transaksi"
        />
        <Tile
          label="Total diterima"
          value={formatRupiah(t.totalReceived)}
          detail={`${t.itemQty} item terjual`}
        />
      </section>

      <section aria-label="Rincian penjualan" className={card}>
        <h2 className="text-lg font-semibold">Rincian penjualan</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
          <Row label="Penjualan kotor" value={formatRupiah(t.grossSales)} />
          <Row label="Diskon" value={`−${formatRupiah(t.discount)}`} />
          {t.serviceAmount > 0 && (
            <Row label="Biaya layanan" value={formatRupiah(t.serviceAmount)} />
          )}
          {t.taxAmount > 0 && <Row label="PB1" value={formatRupiah(t.taxAmount)} />}
          <Row label="Total diterima" value={formatRupiah(t.totalReceived)} strong />
          <Row label="Penjualan bersih" value={formatRupiah(t.netSales)} />
          <Row label="HPP" value={`−${formatRupiah(t.cost)}`} />
          <Row label="Laba kotor" value={formatRupiah(t.grossProfit)} strong />
        </dl>
        <p className="text-sm text-slate-500">
          Penjualan bersih = harga jual setelah diskon, tanpa biaya layanan dan PB1. Laba kotor =
          penjualan bersih − HPP.
          {report.includesTaxInPrices &&
            ' Untuk harga yang sudah termasuk pajak, layanan dan PB1 dipisahkan dari harganya.'}
        </p>
        {report.cancelled.transactions > 0 && (
          <p className="text-sm text-slate-600">
            {report.cancelled.transactions} transaksi dibatalkan/direfund (
            {formatRupiah(report.cancelled.total)}) tidak dihitung.
          </p>
        )}
        {report.missingItems > 0 && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Rincian item {report.missingItems} transaksi belum tersinkron, jadi HPP-nya belum
            dihitung. Laba kotor akan diperbarui setelah sinkron.
          </p>
        )}
      </section>

      <PaymentMethods report={report} />

      <section aria-label="Jam ramai" className={card}>
        <h2 className="text-lg font-semibold">Jam ramai</h2>
        <HourChart byHour={report.byHour} />
      </section>

      {period.kind !== 'day' && <Days report={report} />}
      <Products report={report} />
      <Shifts data={data} />
      <Exports data={data} period={period} />
    </>
  );
}

function Tile({
  label,
  value,
  detail,
  testId,
}: {
  label: string;
  value: string;
  detail?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-xl font-bold sm:text-2xl" data-testid={testId}>
        {value}
      </span>
      {detail && <span className="text-sm text-slate-500">{detail}</span>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <>
      <dt className={strong ? 'font-semibold' : 'text-slate-600'}>{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'font-bold' : ''}`}>{value}</dd>
    </>
  );
}

function PaymentMethods({ report }: { report: SalesReport }) {
  const total = report.totals.totalReceived;
  return (
    <section aria-label="Metode bayar" className={card}>
      <h2 className="text-lg font-semibold">Metode bayar</h2>
      <ul className="flex flex-col gap-3">
        {report.byMethod.map((row) => {
          const share = total ? (row.totalReceived / total) * 100 : 0;
          return (
            <li key={row.method} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 font-semibold">{PAYMENT_LABELS[row.method]}</span>
                <span className="text-sm text-slate-500">{row.transactions} transaksi</span>
                <span className="w-32 text-right font-semibold tabular-nums">
                  {formatRupiah(row.totalReceived)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-brand-50" aria-hidden>
                <div className="h-2 rounded-full bg-brand-600" style={{ width: `${share}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Days({ report }: { report: SalesReport }) {
  return (
    <section aria-label="Per hari" className={card}>
      <h2 className="text-lg font-semibold">Per hari</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 font-semibold">Tanggal</th>
            <th className="py-1 text-right font-semibold">Trx</th>
            <th className="py-1 text-right font-semibold">Bersih</th>
            <th className="py-1 text-right font-semibold">Laba</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {report.byDay.map((day) => (
            <tr
              key={day.date}
              className={`border-t border-slate-100 ${day.transactions ? '' : 'text-slate-400'}`}
            >
              <td className="py-1.5">
                {weekdayShort(day.date)}, {formatDayShort(day.date)}
              </td>
              <td className="py-1.5 pl-2 text-right">{day.transactions}</td>
              <td className="py-1.5 pl-3 text-right">{formatRupiah(day.netSales)}</td>
              <td className="py-1.5 pl-3 text-right">{formatRupiah(day.grossProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Products({ report }: { report: SalesReport }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? report.byProduct : report.byProduct.slice(0, PRODUCTS_SHOWN);
  return (
    <section aria-label="Per produk" className={card}>
      <h2 className="text-lg font-semibold">Per produk</h2>
      {rows.length === 0 ? (
        <p className="text-slate-500">Belum ada produk terjual.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 font-semibold">Produk</th>
              <th className="py-1 text-right font-semibold">Qty</th>
              <th className="py-1 text-right font-semibold">Bersih</th>
              <th className="py-1 text-right font-semibold">Laba</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((p) => {
              const margin = ratioBps(p.grossProfit, p.netSales);
              return (
                <tr key={p.productId} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-2">
                    <span className="font-semibold">{p.name}</span>
                    {margin !== null && (
                      <span className="block text-slate-500">margin {formatBps(margin)}</span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2 text-right">{p.qty}</td>
                  <td className="py-1.5 pl-3 text-right">{formatRupiah(p.netSales)}</td>
                  <td className="py-1.5 pl-3 text-right">{formatRupiah(p.grossProfit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {report.byProduct.length > PRODUCTS_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="min-h-12 font-semibold text-brand-800"
        >
          {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${report.byProduct.length})`}
        </button>
      )}
    </section>
  );
}

function Shifts({ data }: { data: ReportData }) {
  return (
    <section aria-label="Rekap tutup kasir" className={card}>
      <h2 className="text-lg font-semibold">Rekap tutup kasir</h2>
      {data.shifts.length === 0 ? (
        <p className="text-slate-500">Belum ada kasir yang dibuka di periode ini.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {data.shifts.map((s) => (
            <li key={s.id}>
              <Link to={`/kas/${s.id}`} className="flex min-h-14 items-center gap-3 py-2">
                <span className="flex-1">
                  <span className="block font-semibold">
                    {s.deviceLabel} · {formatDayShort(jakartaDateKey(s.openedAt))}{' '}
                    {clock(s.openedAt)}–{s.closedAt ? clock(s.closedAt) : ''}
                  </span>
                  <span className="text-sm text-slate-500">
                    {s.closedByName ?? s.openedByName} · {s.summary.transactions} transaksi
                  </span>
                </span>
                {s.cashDifference === null ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                    Masih buka
                  </span>
                ) : (
                  <DifferenceBadge difference={s.cashDifference} />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Exports({ data, period }: { data: ReportData; period: Period }) {
  const label = periodFileLabel(period);
  const files = [
    {
      name: 'Transaksi',
      file: `reqap-transaksi-${label}.csv`,
      csv: () => transactionsCsv(data.transactions, data.items, data.names),
    },
    {
      name: 'Item terjual',
      file: `reqap-item-${label}.csv`,
      csv: () => itemsCsv(data.transactions, data.items),
    },
    {
      name: 'Per produk',
      file: `reqap-produk-${label}.csv`,
      csv: () => productsCsv(data.report.byProduct),
    },
    {
      name: 'Tutup kasir',
      file: `reqap-tutup-kasir-${label}.csv`,
      csv: () => shiftsCsv(data.shifts),
    },
    {
      name: 'Kas masuk/keluar',
      file: `reqap-kas-${label}.csv`,
      csv: () => cashMovementsCsv(data.movements, data.names),
    },
  ];
  return (
    <section aria-label="Ekspor CSV" className={card}>
      <h2 className="text-lg font-semibold">Ekspor CSV</h2>
      <p className="text-sm text-slate-600">
        File tersimpan di folder Download. Buka di Google Sheets lewat File → Impor → Upload.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {files.map((f, i) => (
          <button
            key={f.file}
            type="button"
            onClick={() => downloadCsv(f.file, f.csv())}
            className={`min-h-12 rounded-xl bg-white px-3 font-semibold text-slate-800 ring-1 ring-slate-300 active:bg-slate-100 ${
              i === files.length - 1 && files.length % 2 ? 'col-span-2' : ''
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>
    </section>
  );
}
