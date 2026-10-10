import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { cloudErrorMessage, updatePassword } from '../../cloud/account';
import { useCloudAuth } from '../../cloud/hooks';
import { Button, ErrorText, Field, inputClass } from '../../ui/kit';

/** Opened from the "reset password" email: the link signs the owner in, then they pick a new password. */
export function NewPasswordPage() {
  const auth = useCloudAuth();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (auth === undefined) return <main className="p-6 text-slate-500">Memuat…</main>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password minimal 8 karakter.');
    if (password !== again) return setError('Kedua password tidak sama.');
    setBusy(true);
    try {
      await updatePassword(auth!.client, password);
      setDone(true);
    } catch (err) {
      setError(cloudErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Password baru</h1>
      {done ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p role="status">Password baru tersimpan.</p>
          <Link to="/akun" className="font-semibold text-brand-800 underline">
            Ke halaman akun
          </Link>
        </section>
      ) : !auth?.email ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p>
            Tautan ini tidak berlaku atau sudah kedaluwarsa. Minta tautan baru lewat &quot;Lupa
            password?&quot; di halaman akun.
          </p>
          <Link to="/akun" className="font-semibold text-brand-800 underline">
            Ke halaman akun
          </Link>
        </section>
      ) : (
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
        >
          <p className="text-slate-600">Buat password baru untuk {auth.email}.</p>
          <Field label="Password baru" hint="Minimal 8 karakter.">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Ulangi password baru">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan password'}
          </Button>
        </form>
      )}
    </main>
  );
}
