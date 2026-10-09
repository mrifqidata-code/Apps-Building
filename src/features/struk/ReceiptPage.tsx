import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useSession } from '../../app/session-context';
import { db } from '../../db/db';
import { formatRupiah } from '../../domain/money';
import {
  STATUS_BANNER,
  formatReceiptText,
  formatSummaryAmount,
  normalizeWhatsAppNumber,
  receiptItemName,
  receiptSummaryRows,
  whatsAppShareUrl,
  type ReceiptView,
} from '../../domain/receipt-text';
import { formatJakartaDateTime } from '../../domain/time';
import { META_PRINTER, type PrinterPrefs } from '../../printing/printer';
import { printReceipt } from '../../printing/receipt-print';
import { isBleSupported, isSerialSupported, printerErrorMessage } from '../../printing/transports';
import { useImageUrl } from '../../ui/images';
import { Button, ErrorText, inputClass } from '../../ui/kit';
import { saveReceiptAsPdf } from './pdf';
import { useReceipt } from './useReceipt';

type PrintState =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'done' } | { kind: 'error'; text: string };

export function ReceiptPage() {
  const { id } = useParams();
  const receipt = useReceipt(id);
  const navigate = useNavigate();
  const justPaid = (useLocation().state as { justPaid?: boolean } | null)?.justPaid ?? false;

  if (receipt === undefined) return <main className="p-6 text-slate-500">Memuat…</main>;
  if (receipt === null) {
    return (
      <main className="mx-auto max-w-md p-6">
        <ErrorText>Struk tidak ditemukan.</ErrorText>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      {justPaid && (
        <div
          role="status"
          className="rounded-2xl bg-emerald-50 p-4 text-center text-emerald-900 ring-1 ring-emerald-200"
        >
          <p className="text-lg font-bold">Transaksi berhasil disimpan</p>
          {receipt.paymentMethod === 'cash' && (
            <p className="mt-1 text-2xl font-bold tabular-nums">
              Kembalian {formatRupiah(receipt.changeAmount)}
            </p>
          )}
        </div>
      )}

      <PrintActions receipt={receipt} autoPrint={justPaid} />
      <ReceiptPaper receipt={receipt} />
      <WhatsAppShare receipt={receipt} />

      {justPaid ? (
        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col bg-slate-50 px-4 pt-2 pb-4">
          <Button variant="primary" className="min-h-16 text-xl" onClick={() => navigate('/')}>
            Transaksi baru
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => navigate('/riwayat')}>
          ← Riwayat
        </Button>
      )}
    </main>
  );
}

function PrintActions({ receipt, autoPrint }: { receipt: ReceiptView; autoPrint: boolean }) {
  const { store } = useSession();
  const prefs = useLiveQuery(
    async () => ((await db.meta.get(META_PRINTER))?.value as PrinterPrefs | undefined) ?? null,
  );
  const [state, setState] = useState<PrintState>({ kind: 'idle' });
  const autoPrinted = useRef(false);
  const canPrint = isBleSupported() || isSerialSupported();

  const print = async (allowPicker: boolean) => {
    setState({ kind: 'busy' });
    try {
      await printReceipt(receipt, store.logoImageId, { allowPicker });
      setState({ kind: 'done' });
    } catch (e) {
      setState({ kind: 'error', text: printerErrorMessage(e) });
    }
  };

  // Right after payment, print on its own when the owner turned that on.
  // No picker here: it only works if the printer can be reached without a tap.
  const autoPrintEnabled = prefs?.autoPrint ?? false;
  useEffect(() => {
    if (!autoPrint || !autoPrintEnabled || autoPrinted.current) return;
    autoPrinted.current = true;
    setState({ kind: 'busy' });
    printReceipt(receipt, store.logoImageId)
      .then(() => setState({ kind: 'done' }))
      .catch((e: unknown) => setState({ kind: 'error', text: printerErrorMessage(e) }));
  }, [autoPrint, autoPrintEnabled, receipt, store.logoImageId]);

  return (
    <section aria-label="Cetak struk" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {canPrint && (
          <Button variant="primary" disabled={state.kind === 'busy'} onClick={() => print(true)}>
            {state.kind === 'busy' ? 'Mencetak…' : 'Cetak struk'}
          </Button>
        )}
        <Button onClick={saveReceiptAsPdf} className={canPrint ? '' : 'col-span-2'}>
          Simpan PDF
        </Button>
      </div>
      {state.kind === 'done' && (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          Struk terkirim ke printer.
        </p>
      )}
      {state.kind === 'error' && <ErrorText>{state.text}</ErrorText>}
      {canPrint && !prefs && state.kind === 'idle' && (
        <p className="text-sm text-slate-500">
          Printer belum diatur. Ketuk Cetak struk untuk memilih printer, atau atur di Pengaturan.
        </p>
      )}
      {!canPrint && (
        <p className="text-sm text-slate-500">
          Browser ini tidak bisa terhubung ke printer Bluetooth. Simpan sebagai PDF atau kirim lewat
          WhatsApp.
        </p>
      )}
    </section>
  );
}

function ReceiptPaper({ receipt: r }: { receipt: ReceiptView }) {
  const { store } = useSession();
  const logoUrl = useImageUrl(store.logoImageId);
  const banner = STATUS_BANNER[r.status];
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? 'text-lg font-bold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <article
      aria-label="Struk"
      data-print-area
      className="flex flex-col gap-3 rounded-2xl bg-white p-5 font-mono text-sm shadow-sm ring-1 ring-slate-200 select-text"
    >
      <header className="flex flex-col items-center text-center">
        {logoUrl && <img src={logoUrl} alt="" className="mb-2 max-h-20 max-w-40 object-contain" />}
        <h1 className="font-sans text-lg font-bold">{r.storeName}</h1>
        {r.storeAddress && <p>{r.storeAddress}</p>}
        {r.storePhone && <p>Telp. {r.storePhone}</p>}
        {banner && <p className="mt-2 font-bold text-red-700">{banner}</p>}
      </header>
      <div className="border-t border-dashed border-slate-300 pt-3">
        <p data-testid="nomor-struk">No. {r.receiptNo}</p>
        <p>{formatJakartaDateTime(r.createdAt)}</p>
        <p>Kasir: {r.cashierName}</p>
      </div>
      <ul className="flex flex-col gap-2 border-t border-dashed border-slate-300 pt-3">
        {r.lines.map((line, i) => (
          <li key={i}>
            <p className="font-semibold">{receiptItemName(line)}</p>
            {row(
              `  ${line.qty} x ${formatRupiah(line.unitPrice)}`,
              formatRupiah(line.qty * line.unitPrice),
            )}
            {line.discountAmount > 0 && row('  Diskon', `-${formatRupiah(line.discountAmount)}`)}
            {line.note && <p className="text-slate-600"> Catatan: {line.note}</p>}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 border-t border-dashed border-slate-300 pt-3">
        {receiptSummaryRows(r).map((summary) => (
          <div key={summary.label}>
            {row(
              summary.kind === 'included' ? `  ${summary.label}` : summary.label,
              formatSummaryAmount(summary),
              summary.kind === 'total',
            )}
          </div>
        ))}
      </div>
      {r.footer && (
        <p className="border-t border-dashed border-slate-300 pt-3 text-center">{r.footer}</p>
      )}
    </article>
  );
}

function WhatsAppShare({ receipt }: { receipt: ReceiptView }) {
  const [phone, setPhone] = useState('');
  const normalized = phone.trim() ? normalizeWhatsAppNumber(phone) : null;
  const invalid = phone.trim() !== '' && normalized === null;
  const url = whatsAppShareUrl(formatReceiptText(receipt), normalized);

  return (
    <section
      aria-label="Kirim struk"
      className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-700">
          Nomor WhatsApp pelanggan (opsional)
        </span>
        <input
          className={inputClass}
          inputMode="tel"
          placeholder="0812xxxxxxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <span className="text-sm text-slate-500">
          Nomor hanya dipakai untuk membuka WhatsApp dan tidak disimpan. Kosongkan untuk memilih
          kontak di WhatsApp.
        </span>
      </label>
      {invalid && <ErrorText>Nomor WhatsApp tidak valid.</ErrorText>}
      <a
        href={invalid ? undefined : url}
        target="_blank"
        rel="noreferrer"
        aria-disabled={invalid}
        className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 font-semibold text-white ${
          invalid ? 'pointer-events-none bg-slate-300' : 'bg-emerald-600 active:bg-emerald-700'
        }`}
      >
        Kirim struk ke WhatsApp
      </a>
    </section>
  );
}
