import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useSession } from '../../app/session-context';
import { pinCheckMessage, setUserPin, signIn } from '../../db/auth';
import { db } from '../../db/db';
import type { User } from '../../db/schema';
import { nowIso } from '../../domain/time';
import { Button, ErrorText } from '../../ui/kit';
import { errorMessage } from '../../ui/errors';
import { PinPad } from '../../ui/PinPad';

const ROLE_LABEL = { owner: 'Pemilik', cashier: 'Kasir' } as const;
const ownerFirst = (u: User) => (u.role === 'owner' ? 0 : 1);

export function LoginPage() {
  const { store, user: activeUser } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const users = useLiveQuery(
    () =>
      db.users
        .where({ storeId: store.id })
        .filter((u) => u.active && !u.deletedAt)
        .toArray()
        .then((list) =>
          list.sort((a, b) => ownerFirst(a) - ownerFirst(b) || a.name.localeCompare(b.name)),
        ),
    [store.id],
  );
  const [selected, setSelected] = useState<User | null>(null);

  if (activeUser) return <Navigate to={from} replace />;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 p-6">
      <div className="text-center">
        <p className="text-sm text-slate-500">{store.name}</p>
        <h1 className="text-2xl font-bold">{selected ? selected.name : 'Siapa yang bertugas?'}</h1>
      </div>

      {selected ? (
        <PinStep
          user={selected}
          onBack={() => setSelected(null)}
          onSignedIn={() => navigate(from, { replace: true })}
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Pengguna">
          {users?.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => setSelected(u)}
                className="flex min-h-16 w-full items-center justify-between rounded-2xl bg-white px-5 text-left shadow-sm ring-1 ring-slate-200 active:bg-slate-50"
              >
                <span className="text-lg font-semibold">{u.name}</span>
                <span className="text-sm text-slate-500">{ROLE_LABEL[u.role]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function PinStep({
  user,
  onBack,
  onSignedIn,
}: {
  user: User;
  onBack: () => void;
  onSignedIn: () => void;
}) {
  const creating = !user.pinHash;
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const instruction = creating
    ? firstPin
      ? 'Ulangi PIN baru untuk memastikan.'
      : 'Buat PIN baru (4–6 angka). PIN dipakai setiap kali masuk.'
    : 'Masukkan PIN Anda.';

  const submit = async (pin: string) => {
    setError(null);
    setBusy(true);
    try {
      if (creating && !firstPin) {
        setFirstPin(pin);
        return;
      }
      if (creating) {
        if (pin !== firstPin) {
          setFirstPin(null);
          setError('PIN tidak sama. Silakan buat ulang.');
          return;
        }
        await setUserPin(db, user.id, pin, nowIso());
      }
      const result = await signIn(db, user.id, pin);
      if (result.ok) onSignedIn();
      else setError(pinCheckMessage(result));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-center text-slate-600">{instruction}</p>
      <ErrorText>{error}</ErrorText>
      <PinPad
        key={firstPin ?? 'first'}
        busy={busy}
        onSubmit={submit}
        submitLabel={creating ? (firstPin ? 'Simpan' : 'Lanjut') : 'Masuk'}
      />
      <Button variant="ghost" onClick={onBack}>
        ← Pilih pengguna lain
      </Button>
    </div>
  );
}
