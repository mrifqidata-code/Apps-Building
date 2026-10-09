import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  cloudErrorMessage,
  firstSync,
  normalizePairingCode,
  pairWithCode,
} from '../../cloud/account';
import { useCloudAuth, useCloudLink } from '../../cloud/hooks';
import { countUnsent } from '../../cloud/link';
import { db } from '../../db/db';
import { META_IS_DEMO } from '../../db/seed';
import { Button, ErrorText, Field, inputClass } from '../../ui/kit';

const card = 'flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200';

/** "ABCDEFGH" -> "ABCD-EFGH" while typing. */
const formatCode = (raw: string) => {
  const code = normalizePairingCode(raw).slice(0, 8);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
};

/** A cashier phone joins the store with the 8-character code from the owner. */
export function PairPage() {
  const auth = useCloudAuth();
  const link = useCloudLink();
  const [code, setCode] = useState('');
  const [name, setName] = useState('HP Kasir');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsent = useLiveQuery(() => countUnsent(db));
  const isDemo = useLiveQuery(async () => Boolean((await db.meta.get(META_IS_DEMO))?.value));

  if (auth === null) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-slate-600">Fitur sinkron belum diaktifkan di aplikasi ini.</p>
      </main>
    );
  }
  if (auth === undefined || link === undefined) {
    return <main className="p-6 text-slate-500">Memuat…</main>;
  }

  if (link && auth.hasSession) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
        <h1 className="text-xl font-bold">Pasang HP kasir</h1>
        <section className={card}>
          <p>HP ini sudah terhubung ke toko.</p>
          <Link to="/" className="font-semibold text-teal-800 underline">
            Kembali ke kasir
          </Link>
        </section>
      </main>
    );
  }

  const repairing = link?.role === 'device';
  const losesSales = !repairing && (unsent?.sales ?? 0) > 0 && !isDemo;
  const ready = normalizePairingCode(code).length === 8 && name.trim() !== '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('Menghubungkan…');
    try {
      const result = await pairWithCode(auth.client, db, code, name.trim());
      setBusy('Mengambil data toko…');
      await firstSync(auth.client, db, result.storeId);
      window.location.assign('/masuk');
    } catch (err) {
      setError(cloudErrorMessage(err));
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Pasang HP kasir</h1>
      <form onSubmit={submit} className={card} aria-label="Pasang HP kasir">
        <p className="text-slate-600">
          {repairing
            ? 'Sambungan HP ini ke toko terputus. Minta kode pasang baru ke pemilik untuk menyambung lagi. Data di HP ini tetap ada.'
            : 'Minta pemilik membuka Pengaturan → Akun & sinkron → Tambah HP kasir, lalu ketik kode yang muncul di sana.'}
        </p>
        <Field label="Kode pasang" hint="8 huruf/angka, berlaku 10 menit.">
          <input
            className={`${inputClass} font-mono text-2xl tracking-widest uppercase`}
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABCD-EFGH"
            onChange={(e) => setCode(formatCode(e.target.value))}
          />
        </Field>
        <Field label="Nama HP ini" hint="Supaya pemilik tahu HP mana, mis. Kasir depan.">
          <input
            className={inputClass}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {!repairing && (
          <p className="text-sm text-slate-600">
            {isDemo
              ? 'Data contoh di HP ini akan diganti dengan data toko.'
              : 'Data di HP ini akan diganti dengan data toko.'}
          </p>
        )}
        {losesSales && (
          <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            HP ini punya {unsent?.sales} transaksi yang belum tersimpan di cloud. Saya mengerti
            transaksi itu akan dihapus dari HP ini.
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <Button
          variant="primary"
          type="submit"
          disabled={!ready || Boolean(busy) || (losesSales && !confirmed)}
        >
          {busy ?? 'Pasang HP ini'}
        </Button>
      </form>
    </main>
  );
}
