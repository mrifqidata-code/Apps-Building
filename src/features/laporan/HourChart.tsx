import { useState } from 'react';
import { formatRupiah } from '../../domain/money';
import { busiestHour, formatHourRange, type HourRow } from '../../domain/report';

const CHART_HEIGHT_PX = 128;
const LABEL_EVERY = 3;

/**
 * Transactions per hour of the day (WIB), one column per hour. The busiest
 * hour is the accent; tapping or hovering a column shows its numbers in the
 * line above the chart. A table with the same numbers is one tap away.
 */
export function HourChart({ byHour }: { byHour: HourRow[] }) {
  const busiest = busiestHour(byHour);
  const [active, setActive] = useState<number | null>(null);
  if (!busiest) {
    return <p className="text-slate-500">Belum ada transaksi di periode ini.</p>;
  }
  const max = busiest.transactions;
  const shown = byHour[active ?? busiest.hour]!;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-slate-700" aria-live="polite" data-testid="jam-ramai">
        {active === null || active === busiest.hour ? 'Paling ramai ' : 'Jam '}
        <strong>{formatHourRange(shown.hour)}</strong> · {shown.transactions} transaksi ·{' '}
        {formatRupiah(shown.totalReceived)}
      </p>
      <div
        className="flex items-end gap-[2px] border-b border-slate-200"
        style={{ height: CHART_HEIGHT_PX }}
        onMouseLeave={() => setActive(null)}
      >
        {byHour.map((row) => {
          const isBusiest = row.hour === busiest.hour;
          const isActive = row.hour === (active ?? busiest.hour);
          // The tallest column leaves room for its label above it.
          const height = row.transactions ? Math.max(4, (row.transactions / max) * 85) : 0;
          return (
            <button
              key={row.hour}
              type="button"
              aria-label={`${formatHourRange(row.hour)}: ${row.transactions} transaksi`}
              aria-pressed={isActive}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none focus-visible:bg-brand-50"
              onMouseEnter={() => setActive(row.hour)}
              onFocus={() => setActive(row.hour)}
              onClick={() => setActive(row.hour)}
            >
              {isBusiest && (
                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                  {row.transactions}
                </span>
              )}
              <span
                className={`w-full max-w-6 rounded-t-[4px] ${
                  isActive ? 'bg-brand-700' : isBusiest ? 'bg-brand-500' : 'bg-brand-300'
                }`}
                style={{ height: `${height}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex gap-[2px] text-xs text-slate-500 tabular-nums" aria-hidden>
        {byHour.map((row) => (
          <span key={row.hour} className="min-w-0 flex-1 text-center">
            {row.hour % LABEL_EVERY === 0 ? String(row.hour).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
      <details>
        <summary className="min-h-12 cursor-pointer py-3 font-semibold text-brand-800">
          Lihat sebagai tabel
        </summary>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 font-semibold">Jam</th>
              <th className="py-1 text-right font-semibold">Transaksi</th>
              <th className="py-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {byHour
              .filter((row) => row.transactions > 0)
              .map((row) => (
                <tr key={row.hour} className="border-t border-slate-100">
                  <td className="py-1">{formatHourRange(row.hour)}</td>
                  <td className="py-1 text-right">{row.transactions}</td>
                  <td className="py-1 text-right">{formatRupiah(row.totalReceived)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
