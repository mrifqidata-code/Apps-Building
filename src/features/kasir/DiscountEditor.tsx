import { useState } from 'react';
import { formatBps, formatRupiah, percentToBps, type Rupiah } from '../../domain/money';
import { discountAmountOf, type Discount } from '../../domain/pricing';
import { ErrorText, MoneyInput, inputClass } from '../../ui/kit';

/** Lets the cashier choose a discount in rupiah or percent. */
export function DiscountEditor({
  value,
  onChange,
  base,
}: {
  value: Discount | null;
  onChange: (discount: Discount | null) => void;
  /** Amount the discount applies to, for the preview. */
  base: Rupiah;
}) {
  const [type, setType] = useState<Discount['type']>(value?.type ?? 'amount');
  const [percentText, setPercentText] = useState(
    value?.type === 'percent' ? String(value.value / 100).replace('.', ',') : '',
  );
  const [error, setError] = useState<string | null>(null);

  const setPercent = (text: string) => {
    setPercentText(text);
    const normalized = text.replace(',', '.').trim();
    if (!normalized) return onChange(null);
    const percent = Number(normalized);
    try {
      onChange({ type: 'percent', value: percentToBps(percent) });
      setError(null);
    } catch {
      setError('Persen harus antara 0 dan 100.');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Jenis diskon">
        {(['amount', 'percent'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => {
              setType(t);
              setError(null);
              setPercentText('');
              onChange(null);
            }}
            className={`min-h-12 rounded-xl font-semibold ${
              type === t ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-300'
            }`}
          >
            {t === 'amount' ? 'Rupiah (Rp)' : 'Persen (%)'}
          </button>
        ))}
      </div>
      {type === 'amount' ? (
        <MoneyInput
          aria-label="Nominal diskon"
          value={value?.type === 'amount' ? value.value : null}
          onChange={(v) => onChange(v ? { type: 'amount', value: v } : null)}
          placeholder="0"
        />
      ) : (
        <div className="relative">
          <input
            aria-label="Persen diskon"
            inputMode="decimal"
            className={`${inputClass} pr-10`}
            value={percentText}
            placeholder="0"
            onChange={(e) => setPercent(e.target.value)}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500">
            %
          </span>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {value && (
        <p className="text-sm text-slate-600">
          Diskon {value.type === 'percent' ? `${formatBps(value.value)} = ` : ''}
          <strong>{formatRupiah(discountAmountOf(base, value))}</strong>
        </p>
      )}
    </div>
  );
}
