import { useState } from 'react';
import { useSession, useSignedInUser } from '../../app/session-context';
import { updateStoreSettings } from '../../db/catalog-admin';
import { db } from '../../db/db';
import { formatBps, formatRupiah, type Bps } from '../../domain/money';
import { calculateCart } from '../../domain/pricing';
import { nowIso } from '../../domain/time';
import { errorMessage } from '../../ui/errors';
import { Button, ErrorText, Field, PercentInput } from '../../ui/kit';

const EXAMPLE_ORDER = 100_000;

/** PB1 (restaurant tax) and service charge, both optional. */
export function TaxSection() {
  const { store, device } = useSession();
  const user = useSignedInUser();
  const [pricesIncludeTax, setPricesIncludeTax] = useState(store.pricesIncludeTax);
  const [pb1Bps, setPb1Bps] = useState<Bps | null>(store.pb1Bps);
  const [serviceBps, setServiceBps] = useState<Bps | null>(store.serviceBps);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const valid = pb1Bps !== null && serviceBps !== null;
  const example = valid
    ? calculateCart([{ unitPrice: EXAMPLE_ORDER, qty: 1 }], null, {
        pricesIncludeTax,
        pb1Bps,
        serviceBps,
      })
    : null;

  const save = async () => {
    if (!valid) return setMessage({ ok: false, text: 'Persen harus angka 0 sampai 100.' });
    try {
      await updateStoreSettings(
        db,
        store.id,
        { pricesIncludeTax, pb1Bps, serviceBps },
        { userId: user.id, deviceId: device.id },
        nowIso(),
      );
      setMessage({ ok: true, text: 'Pengaturan pajak tersimpan. Berlaku untuk transaksi baru.' });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <section
      aria-label="Pajak dan biaya layanan"
      className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <div>
        <h2 className="text-lg font-semibold">Pajak dan biaya layanan</h2>
        <p className="text-sm text-slate-600">
          Isi 0 kalau tidak dipakai. Biaya layanan dihitung dari harga setelah diskon, lalu PB1
          dihitung dari harga setelah diskon ditambah biaya layanan.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="PB1 (pajak restoran)">
          <PercentInput
            aria-label="Persen PB1"
            value={pb1Bps}
            onChange={(v) => {
              setMessage(null);
              setPb1Bps(v);
            }}
          />
        </Field>
        <Field label="Biaya layanan">
          <PercentInput
            aria-label="Persen biaya layanan"
            value={serviceBps}
            onChange={(v) => {
              setMessage(null);
              setServiceBps(v);
            }}
          />
        </Field>
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          className="size-6 accent-brand-700"
          checked={pricesIncludeTax}
          onChange={(e) => {
            setMessage(null);
            setPricesIncludeTax(e.target.checked);
          }}
        />
        <span>
          <span className="font-semibold">Harga di menu sudah termasuk pajak dan layanan</span>
          <span className="block text-sm text-slate-500">
            Kalau dicentang, total tidak bertambah. Pajak hanya dirinci di struk.
          </span>
        </span>
      </label>
      {example && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700" data-testid="contoh-pajak">
          Contoh pesanan {formatRupiah(EXAMPLE_ORDER)}:{' '}
          {example.serviceAmount === 0 && example.taxAmount === 0
            ? 'tanpa pajak dan layanan'
            : `layanan ${formatRupiah(example.serviceAmount)}, PB1 ${formatRupiah(example.taxAmount)}${pricesIncludeTax ? ' (sudah termasuk)' : ''}`}
          , total dibayar <strong>{formatRupiah(example.total)}</strong>.
        </p>
      )}
      {message && !message.ok && <ErrorText>{message.text}</ErrorText>}
      {message?.ok && (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          {message.text}
        </p>
      )}
      <Button variant="primary" onClick={save}>
        Simpan pajak
      </Button>
    </section>
  );
}

/** How much discount cashiers may give without the owner. */
export function DiscountLimitSection() {
  const { store, device } = useSession();
  const user = useSignedInUser();
  const [limit, setLimit] = useState<Bps | null>(store.cashierMaxDiscountBps);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (limit === null) return setMessage({ ok: false, text: 'Persen harus angka 0 sampai 100.' });
    try {
      await updateStoreSettings(
        db,
        store.id,
        { cashierMaxDiscountBps: limit },
        { userId: user.id, deviceId: device.id },
        nowIso(),
      );
      setMessage({ ok: true, text: 'Batas diskon kasir tersimpan.' });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <section
      aria-label="Batas diskon kasir"
      className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <div>
        <h2 className="text-lg font-semibold">Batas diskon kasir</h2>
        <p className="text-sm text-slate-600">
          Total diskon yang boleh diberikan kasir, dihitung dari harga sebelum diskon. Isi 0 kalau
          hanya pemilik yang boleh memberi diskon.
        </p>
      </div>
      <Field label="Maksimal diskon kasir">
        <PercentInput
          aria-label="Persen batas diskon kasir"
          value={limit}
          onChange={(v) => {
            setMessage(null);
            setLimit(v);
          }}
        />
      </Field>
      {limit !== null && (
        <p className="text-sm text-slate-600">
          {limit === 0
            ? 'Kasir tidak bisa memberi diskon.'
            : `Kasir boleh memberi diskon sampai ${formatBps(limit)} per transaksi.`}
        </p>
      )}
      {message && !message.ok && <ErrorText>{message.text}</ErrorText>}
      {message?.ok && (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          {message.text}
        </p>
      )}
      <Button variant="primary" onClick={save}>
        Simpan batas diskon
      </Button>
    </section>
  );
}
