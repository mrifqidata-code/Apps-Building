import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useSession } from '../../app/session-context';
import { db } from '../../db/db';
import { META_PRINTER, type PrinterPrefs } from '../../printing/printer';
import { printTestPage, printer, usePrinterStatus } from '../../printing/receipt-print';
import {
  isBleSupported,
  isSerialSupported,
  printerErrorMessage,
  type PrinterKind,
} from '../../printing/transports';
import { Button, ErrorText } from '../../ui/kit';

const KIND_LABEL: Record<PrinterKind, string> = {
  ble: 'Bluetooth BLE',
  serial: 'Bluetooth Classic',
};

/** Connect the Bluetooth thermal printer of this device and test it. */
export function PrinterSection() {
  const { store } = useSession();
  const status = usePrinterStatus();
  const prefs = useLiveQuery(
    async () => ((await db.meta.get(META_PRINTER))?.value as PrinterPrefs | undefined) ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const ble = isBleSupported();
  const serial = isSerialSupported();

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: success });
    } catch (e) {
      setMessage({ ok: false, text: printerErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Printer"
      className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <div>
        <h2 className="text-lg font-semibold">Printer struk (58 mm)</h2>
        <p className="text-sm text-slate-600">
          Pengaturan printer berlaku untuk HP ini saja. Nyalakan Bluetooth dan printer dulu.
        </p>
      </div>

      <p
        className={`rounded-xl px-3 py-2 text-sm ${
          status.connected ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-700'
        }`}
        data-testid="status-printer"
      >
        {status.connected
          ? `Terhubung: ${status.name} (${KIND_LABEL[status.kind!]})`
          : prefs
            ? `Printer tersimpan: ${prefs.name} (${KIND_LABEL[prefs.kind]}). Akan dihubungkan saat mencetak.`
            : 'Belum ada printer.'}
      </p>

      {!ble && !serial ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Browser ini tidak bisa terhubung ke printer Bluetooth. Pakai Chrome di HP Android, atau
          kirim struk lewat WhatsApp dan simpan sebagai PDF.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {ble && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => run(() => printer.connect('ble'), 'Printer terhubung.')}
            >
              Hubungkan printer (Bluetooth BLE)
            </Button>
          )}
          {serial && (
            <Button
              disabled={busy}
              onClick={() => run(() => printer.connect('serial'), 'Printer terhubung.')}
            >
              Hubungkan printer (Bluetooth Classic)
            </Button>
          )}
          <details className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <summary className="min-h-10 cursor-pointer font-semibold">
              Cara menghubungkan printer
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Nyalakan printer dan Bluetooth HP. Izinkan Chrome memakai Bluetooth.</li>
              <li>
                Ketuk <strong>Bluetooth BLE</strong>, pilih nama printer di daftar (biasanya diawali
                nama merek atau &quot;Printer&quot;), lalu ketuk Sambungkan.
              </li>
              <li>
                Kalau printer tidak muncul: buka Pengaturan HP → Bluetooth, pasangkan printer (PIN
                biasanya 0000 atau 1234), kembali ke sini lalu ketuk{' '}
                <strong>Bluetooth Classic</strong>.
              </li>
              <li>
                Ketuk <strong>Tes cetak</strong>. Kalau kertas keluar dan tulisannya rapi, printer
                siap dipakai.
              </li>
            </ol>
          </details>
        </div>
      )}

      {prefs && (
        <>
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () => printTestPage(store.name, store.logoImageId),
                'Halaman tes terkirim ke printer.',
              )
            }
          >
            Tes cetak
          </Button>
          <AutoPrintToggle initial={prefs.autoPrint} />
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => run(() => printer.forget(), 'Printer dilupakan.')}
          >
            Lupakan printer
          </Button>
        </>
      )}

      {message && !message.ok && <ErrorText>{message.text}</ErrorText>}
      {message?.ok && (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          {message.text}
        </p>
      )}
    </section>
  );
}

/** Checkbox that updates at once while the preference is saved in the background. */
function AutoPrintToggle({ initial }: { initial: boolean }) {
  const [checked, setChecked] = useState(initial);
  return (
    <label className="flex min-h-12 items-center gap-3">
      <input
        type="checkbox"
        className="size-6 accent-brand-700"
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          void printer.savePrefs({ autoPrint: e.target.checked });
        }}
      />
      <span>
        <span className="font-semibold">Cetak otomatis setelah pembayaran</span>
        <span className="block text-sm text-slate-500">
          Struk langsung tercetak tanpa mengetuk tombol Cetak.
        </span>
      </span>
    </label>
  );
}
