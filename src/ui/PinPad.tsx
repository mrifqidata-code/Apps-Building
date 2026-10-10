import { useEffect, useState } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'hapus', '0', 'ok'] as const;

/** Big on-screen keypad for 4-6 digit PINs. */
export function PinPad({
  onSubmit,
  submitLabel,
  busy = false,
}: {
  onSubmit: (pin: string) => void;
  submitLabel: string;
  busy?: boolean;
}) {
  const [pin, setPin] = useState('');

  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'hapus') setPin((p) => p.slice(0, -1));
    else if (key === 'ok') {
      if (pin.length >= 4) {
        onSubmit(pin);
        setPin('');
      }
    } else setPin((p) => (p.length < 6 ? p + key : p));
  };

  // Laptops: typing digits, Backspace and Enter works like the on-screen keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (busy || target?.closest('input, textarea, select')) return;
      // A focused button already turns Enter into a click; handling it here too would submit twice.
      if (e.key === 'Enter' && target?.closest('button')) return;
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === 'Backspace') press('hapus');
      else if (e.key === 'Enter') press('ok');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-5">
      <div className="flex h-6 gap-3" aria-label={`${pin.length} angka dimasukkan`} role="status">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span
            key={i}
            className={`size-4 rounded-full ${i < pin.length ? 'bg-brand-700' : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <div className="grid w-full grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={busy || (key === 'ok' && pin.length < 4)}
            onClick={() => press(key)}
            aria-label={key === 'ok' ? submitLabel : key === 'hapus' ? 'Hapus angka' : key}
            className={`h-16 rounded-2xl text-2xl font-semibold disabled:opacity-40 ${
              key === 'ok'
                ? 'bg-brand-700 text-base text-white'
                : key === 'hapus'
                  ? 'bg-slate-100 text-base text-slate-700'
                  : 'bg-white ring-1 ring-slate-200 active:bg-slate-100'
            }`}
          >
            {key === 'ok' ? submitLabel : key === 'hapus' ? '⌫' : key}
          </button>
        ))}
      </div>
    </div>
  );
}
