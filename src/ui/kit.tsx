import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { formatRupiah, parseRupiah, type Bps, type Rupiah } from '../domain/money';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-teal-700 text-white active:bg-teal-800 disabled:bg-slate-300 disabled:text-slate-500',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-300 active:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-white text-red-700 ring-1 ring-red-200 active:bg-red-50',
  ghost: 'text-teal-800 active:bg-teal-50',
};

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50" aria-hidden onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="flex-1 text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex size-12 items-center justify-center rounded-full text-2xl text-slate-500 active:bg-slate-100"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="border-t border-slate-100 p-4">{footer}</footer>}
      </section>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-sm text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'min-h-12 w-full rounded-xl bg-white px-3 text-base ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-teal-600 select-text';

// Up to Rp999.999.999.999, far beyond any single sale.
const MAX_MONEY_DIGITS = 12;

const groupDigits = (digits: string) =>
  digits ? new Intl.NumberFormat('id-ID').format(Number(digits)) : '';

/** Rupiah input that shows thousand separators while typing ("12.000"). */
export function MoneyInput({
  value,
  onChange,
  allowNegative = false,
  ...props
}: {
  value: Rupiah | null;
  onChange: (value: Rupiah | null) => void;
  allowNegative?: boolean;
  'aria-label'?: string;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  const format = (v: Rupiah | null) =>
    v === null ? '' : `${v < 0 ? '-' : ''}${groupDigits(String(Math.abs(v)))}`;
  const [text, setText] = useState(format(value));
  // Follow outside changes (e.g. a "Uang pas" button) without fighting the typing.
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    if (parseRupiah(text) !== value) setText(format(value));
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500">
        Rp
      </span>
      <input
        {...props}
        inputMode="numeric"
        className={`${inputClass} pl-10`}
        value={text}
        onChange={(e) => {
          const negative = allowNegative && e.target.value.trim().startsWith('-');
          const digits = e.target.value
            .replace(/\D/g, '')
            .replace(/^0+(?=\d)/, '')
            .slice(0, MAX_MONEY_DIGITS);
          setText(`${negative ? '-' : ''}${groupDigits(digits)}`);
          onChange(digits ? Number(digits) * (negative ? -1 : 1) : null);
        }}
      />
    </div>
  );
}

export function Money({ value, className = '' }: { value: Rupiah; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatRupiah(value)}</span>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  );
}

/** Button-styled file picker (the native control shows the browser's own wording). */
export function FilePickerButton({
  label,
  onFile,
  accept = 'image/*',
}: {
  label: string;
  onFile: (file: File) => void;
  accept?: string;
}) {
  return (
    <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-white px-4 font-semibold text-slate-800 ring-1 ring-slate-300 active:bg-slate-100">
      {label}
      <input
        type="file"
        accept={accept}
        aria-label={label}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

const formatPercentInput = (bps: Bps | null) =>
  bps === null ? '' : String(bps / 100).replace('.', ',');

/** Percentage input ("10" or "12,5") that reports basis points, or null while invalid/empty. */
export function PercentInput({
  value,
  onChange,
  ...props
}: {
  value: Bps | null;
  onChange: (value: Bps | null) => void;
  'aria-label'?: string;
  id?: string;
}) {
  const [text, setText] = useState(formatPercentInput(value));
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    setText(formatPercentInput(value));
  }
  return (
    <div className="relative">
      <input
        {...props}
        inputMode="decimal"
        className={`${inputClass} pr-10`}
        value={text}
        placeholder="0"
        onChange={(e) => {
          setText(e.target.value);
          const normalized = e.target.value.replace(',', '.').trim();
          const percent = Number(normalized);
          const valid =
            normalized !== '' && Number.isFinite(percent) && percent >= 0 && percent <= 100;
          const bps = valid ? Math.round(percent * 100) : null;
          setShownValue(bps);
          onChange(bps);
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500">
        %
      </span>
    </div>
  );
}
