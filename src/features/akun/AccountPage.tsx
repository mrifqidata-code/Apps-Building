import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSession } from '../../app/session-context';
import {
  cloudErrorMessage,
  connectLocalStore,
  firstSync,
  joinStoreAsOwner,
  myStores,
  sendPasswordReset,
  signInOwner,
  signUpOwner,
  type MyStore,
} from '../../cloud/account';
import { useCloudAuth, useCloudLink, type CloudAuth } from '../../cloud/hooks';
import { countUnsent, startEmptyStore } from '../../cloud/link';
import { syncManager } from '../../cloud/sync-manager';
import { db } from '../../db/db';
import { META_IS_DEMO } from '../../db/seed';
import { nowIso } from '../../domain/time';
import { Button, ErrorText, Field, inputClass } from '../../ui/kit';

const card = 'flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200';

/**
 * The owner's email account: sign up, sign in, forgotten password, and
 * connecting this device's store to the account (or using the account's
 * store on a new phone).
 */
export function AccountPage() {
  const auth = useCloudAuth();
  const link = useCloudLink();

  if (auth === null) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
        <h1 className="text-xl font-bold">Akun pemilik</h1>
        <p className="text-slate-600">
          Fitur akun dan sinkron belum diaktifkan di aplikasi ini. Data tetap tersimpan di HP ini.
        </p>
      </main>
    );
  }
  if (auth === undefined || link === undefined) {
    return <main className="p-6 text-slate-500">Memuat…</main>;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 p-4">
      <h1 className="text-xl font-bold">Akun pemilik</h1>
      {link?.role === 'device' ? (
        <section className={card}>
          <p>HP ini terhubung ke toko sebagai HP kasir. Akun pemilik tidak diperlukan di sini.</p>
          <Link to="/" className="font-semibold text-brand-800 underline">
            Kembali ke kasir
          </Link>
        </section>
      ) : !auth.email ? (
        <AuthForm client={auth.client} relinking={link?.role === 'owner'} />
      ) : link ? (
        <Connected auth={auth} storeId={link.storeId} />
      ) : (
        <StoreChoice auth={auth} />
      )}
    </main>
  );
}

type Mode = 'masuk' | 'daftar' | 'lupa';

function AuthForm({ client, relinking }: { client: SupabaseClient; relinking: boolean }) {
  const [mode, setMode] = useState<Mode>('masuk');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const origin = window.location.origin;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.includes('@')) return setError('Masukkan alamat email yang benar.');
    if (mode !== 'lupa' && password.length < 8) {
      return setError('Password minimal 8 karakter.');
    }
    setBusy(true);
    try {
      if (mode === 'masuk') {
        await signInOwner(client, email, password);
      } else if (mode === 'daftar') {
        const result = await signUpOwner(client, email, password, `${origin}/akun`);
        if (result === 'check-email') {
          setInfo(
            `Kami mengirim email konfirmasi ke ${email.trim()}. Buka email itu dan ketuk tautannya, lalu kembali ke sini dan masuk.`,
          );
          setMode('masuk');
        }
      } else {
        await sendPasswordReset(client, email, `${origin}/akun/password-baru`);
        setInfo('Tautan untuk membuat password baru sudah dikirim. Cek email Anda.');
      }
    } catch (e) {
      setError(cloudErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      aria-selected={mode === value}
      className={`min-h-12 flex-1 rounded-xl font-semibold ${
        mode === value ? 'bg-brand-700 text-white' : 'text-slate-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className={card} aria-label="Masuk akun pemilik">
      <p className="text-slate-600">
        {relinking
          ? 'Sesi akun di HP ini sudah berakhir. Masuk lagi supaya data toko kembali tersinkron.'
          : 'Masuk dengan email pemilik supaya data toko tersimpan di cloud dan bisa dipakai di beberapa HP.'}
      </p>
      {mode !== 'lupa' && (
        <div role="tablist" className="flex gap-1 rounded-2xl bg-slate-100 p-1">
          {tab('masuk', 'Masuk')}
          {!relinking && tab('daftar', 'Daftar baru')}
        </div>
      )}
      <Field label="Email">
        <input
          className={inputClass}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      {mode !== 'lupa' && (
        <Field
          label="Password"
          hint={mode === 'daftar' ? 'Minimal 8 karakter. Simpan baik-baik.' : undefined}
        >
          <input
            className={inputClass}
            type="password"
            autoComplete={mode === 'daftar' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
      {info && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      )}
      <Button variant="primary" type="submit" disabled={busy}>
        {busy
          ? 'Memproses…'
          : mode === 'masuk'
            ? 'Masuk'
            : mode === 'daftar'
              ? 'Daftar'
              : 'Kirim tautan password baru'}
      </Button>
      {mode === 'lupa' ? (
        <Button variant="ghost" onClick={() => setMode('masuk')}>
          ← Kembali ke Masuk
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => setMode('lupa')}>
          Lupa password?
        </Button>
      )}
    </form>
  );
}

/** This device already syncs with the account's store. */
function Connected({ auth, storeId }: { auth: CloudAuth; storeId: string }) {
  const navigate = useNavigate();
  const [owned, setOwned] = useState<boolean | null>(null);
  useEffect(() => {
    myStores(auth.client)
      .then((stores) => setOwned(stores.some((s) => s.store_id === storeId && s.role === 'owner')))
      .catch(() => setOwned(true));
  }, [auth.client, storeId]);

  if (owned === false) {
    return (
      <section className={card}>
        <ErrorText>
          Akun {auth.email} bukan pemilik toko di HP ini. Keluar, lalu masuk dengan email pemilik
          toko ini.
        </ErrorText>
        <Button onClick={() => auth.client.auth.signOut()}>Keluar dari akun</Button>
      </section>
    );
  }
  return (
    <section className={card}>
      <p>
        Masuk sebagai <strong>{auth.email}</strong>. Data toko di HP ini tersinkron ke akun ini.
      </p>
      <Button variant="primary" onClick={() => navigate('/pengaturan')}>
        Buka Pengaturan
      </Button>
    </section>
  );
}

/** Signed in, device not connected yet: upload this store, use the account's store, or start empty. */
function StoreChoice({ auth }: { auth: CloudAuth }) {
  const { store } = useSession();
  const [stores, setStores] = useState<MyStore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [freshName, setFreshName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const unsent = useLiveQuery(() => countUnsent(db));
  const isDemo = useLiveQuery(async () => Boolean((await db.meta.get(META_IS_DEMO))?.value));
  const productCount = useLiveQuery(() => db.products.filter((p) => !p.deletedAt).count());
  const saleCount = useLiveQuery(() => db.transactions.count());

  useEffect(() => {
    myStores(auth.client)
      .then(setStores)
      .catch((e: unknown) => setError(cloudErrorMessage(e)));
  }, [auth.client]);

  const run = async (label: string, action: () => Promise<void>) => {
    setError(null);
    setBusy(label);
    try {
      await action();
    } catch (e) {
      setError(cloudErrorMessage(e));
      setBusy(null);
    }
  };

  const owned = stores?.find((s) => s.role === 'owner');
  const losesSales = (unsent?.sales ?? 0) > 0 && !isDemo;
  const signOut = (
    <Button variant="ghost" onClick={() => auth.client.auth.signOut()}>
      Bukan {auth.email}? Keluar
    </Button>
  );

  if (!stores) {
    return (
      <section className={card}>
        <p className="text-slate-500">{error ? '' : 'Memeriksa akun…'}</p>
        <ErrorText>{error}</ErrorText>
        {signOut}
      </section>
    );
  }

  if (owned) {
    return (
      <section className={card} aria-label="Pakai toko di akun">
        <p>
          Akun <strong>{auth.email}</strong> sudah punya toko{' '}
          <strong>{owned.store_name ?? '(belum tersinkron)'}</strong>.
        </p>
        <p className="text-sm text-slate-600">
          Data di HP ini akan diganti dengan data toko tersebut. HP ini mendapat kode kasir sendiri
          untuk nomor struk.
        </p>
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
          disabled={Boolean(busy) || (losesSales && !confirmed)}
          onClick={() =>
            run('join', async () => {
              await joinStoreAsOwner(auth.client, db, owned.store_id, 'HP Pemilik');
              await firstSync(auth.client, db, owned.store_id);
              window.location.assign('/masuk');
            })
          }
        >
          {busy === 'join' ? 'Mengambil data toko…' : 'Pakai toko ini di HP ini'}
        </Button>
        {signOut}
      </section>
    );
  }

  return (
    <>
      <section className={card} aria-label="Simpan toko ke akun">
        <h2 className="text-lg font-semibold">Simpan toko di HP ini ke akun</h2>
        <p className="text-sm text-slate-600">
          <strong>{store.name}</strong>: {productCount ?? '…'} produk dan {saleCount ?? '…'}{' '}
          transaksi akan tersimpan di cloud atas nama {auth.email}.
        </p>
        {isDemo && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Toko ini masih berisi data contoh. Kalau ingin mulai dari nol, pilih &quot;Mulai toko
            baru yang kosong&quot; di bawah.
          </p>
        )}
        <ErrorText>{error}</ErrorText>
        <Button
          variant="primary"
          disabled={Boolean(busy)}
          onClick={() =>
            run('upload', async () => {
              await connectLocalStore(auth.client, db);
              await firstSync(auth.client, db, store.id);
              await syncManager.start();
              window.location.assign('/pengaturan');
            })
          }
        >
          {busy === 'upload' ? 'Mengunggah data…' : 'Simpan toko ini ke akun'}
        </Button>
      </section>

      <section className={card} aria-label="Mulai toko baru">
        <h2 className="text-lg font-semibold">Mulai toko baru yang kosong</h2>
        <p className="text-sm text-slate-600">
          Semua data di HP ini, termasuk data contoh, dihapus. Anda lalu mengisi produk sendiri.
        </p>
        <Field label="Nama toko">
          <input
            className={inputClass}
            value={freshName}
            placeholder="mis. Kedai Kopi Bu Sri"
            onChange={(e) => setFreshName(e.target.value)}
          />
        </Field>
        {losesSales && (
          <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Saya mengerti {unsent?.sales} transaksi di HP ini akan dihapus.
          </label>
        )}
        <Button
          disabled={Boolean(busy) || !freshName.trim() || (losesSales && !confirmed)}
          onClick={() =>
            run('fresh', async () => {
              const storeId = await startEmptyStore(db, freshName, nowIso());
              await connectLocalStore(auth.client, db);
              await firstSync(auth.client, db, storeId);
              window.location.assign('/masuk');
            })
          }
        >
          {busy === 'fresh' ? 'Menyiapkan toko…' : 'Mulai toko baru'}
        </Button>
      </section>
      {signOut}
    </>
  );
}
