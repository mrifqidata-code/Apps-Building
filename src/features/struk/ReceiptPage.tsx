import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { formatBps, formatRupiah } from '../../domain/money';
import {
  PAYMENT_LABELS,
  formatReceiptText,
  normalizeWhatsAppNumber,
  whatsAppShareUrl,
  type ReceiptView,
} from '../../domain/receipt-text';
import { formatJakartaDateTime } from '../../domain/time';
import { Button, ErrorText, inputClass } from '../../ui/kit';
import { useReceipt } from './useReceipt';

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

function ReceiptPaper({ receipt: r }: { receipt: ReceiptView }) {
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? 'text-lg font-bold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <article
      aria-label="Struk"
      className="flex flex-col gap-3 rounded-2xl bg-white p-5 font-mono text-sm shadow-sm ring-1 ring-slate-200 select-text"
    >
      <header className="text-center">
        <h1 className="font-sans text-lg font-bold">{r.storeName}</h1>
        {r.storeAddress && <p>{r.storeAddress}</p>}
        {r.storePhone && <p>Telp. {r.storePhone}</p>}
        {r.status !== 'paid' && (
          <p className="mt-2 font-bold text-red-700">
            {r.status === 'void' ? 'TRANSAKSI DIBATALKAN' : 'TRANSAKSI DIREFUND'}
          </p>
        )}
      </header>
      <div className="border-t border-dashed border-slate-300 pt-3">
        <p data-testid="nomor-struk">No. {r.receiptNo}</p>
        <p>{formatJakartaDateTime(r.createdAt)}</p>
        <p>Kasir: {r.cashierName}</p>
      </div>
      <ul className="flex flex-col gap-2 border-t border-dashed border-slate-300 pt-3">
        {r.lines.map((line, i) => (
          <li key={i}>
            <p className="font-semibold">
              {line.name}
              {line.variantNames.length > 0 && ` (${line.variantNames.join(', ')})`}
            </p>
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
        {(r.discountAmount > 0 ||
          (!r.pricesIncludeTax && (r.serviceAmount > 0 || r.taxAmount > 0))) &&
          row('Subtotal', formatRupiah(r.subtotal))}
        {r.discountAmount > 0 && row('Diskon', `-${formatRupiah(r.discountAmount)}`)}
        {!r.pricesIncludeTax &&
          r.serviceAmount > 0 &&
          row(`Biaya layanan (${formatBps(r.serviceBps)})`, formatRupiah(r.serviceAmount))}
        {!r.pricesIncludeTax &&
          r.taxAmount > 0 &&
          row(`PB1 (${formatBps(r.taxBps)})`, formatRupiah(r.taxAmount))}
        {row('Total', formatRupiah(r.total), true)}
        {r.pricesIncludeTax &&
          r.serviceAmount > 0 &&
          row(`  Termasuk layanan (${formatBps(r.serviceBps)})`, formatRupiah(r.serviceAmount))}
        {r.pricesIncludeTax &&
          r.taxAmount > 0 &&
          row(`  Termasuk PB1 (${formatBps(r.taxBps)})`, formatRupiah(r.taxAmount))}
        {row(PAYMENT_LABELS[r.paymentMethod], formatRupiah(r.amountPaid))}
        {r.paymentMethod === 'cash' && row('Kembalian', formatRupiah(r.changeAmount))}
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
