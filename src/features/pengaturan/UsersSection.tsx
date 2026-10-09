import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useSession } from '../../app/session-context';
import { addCashier, setUserPin } from '../../db/auth';
import { db } from '../../db/db';
import type { User } from '../../db/schema';
import { nowIso } from '../../domain/time';
import { errorMessage } from '../../ui/errors';
import { Button, ErrorText, Field, Sheet, inputClass } from '../../ui/kit';
import { PinPad } from '../../ui/PinPad';

export function UsersSection() {
  const { store } = useSession();
  const users = useLiveQuery(
    () =>
      db.users
        .where({ storeId: store.id })
        .filter((u) => !u.deletedAt)
        .sortBy('createdAt'),
    [store.id],
  );
  const [pinFor, setPinFor] = useState<User | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      aria-label="Pengguna"
      className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <div>
        <h2 className="text-lg font-semibold">Pengguna</h2>
        <p className="text-sm text-slate-600">
          Kasir membuat PIN sendiri saat pertama masuk. Pemilik bisa mengatur ulang PIN di sini.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-slate-100">
        {users?.map((u) => (
          <li key={u.id} className="flex min-h-14 items-center gap-3">
            <span className="flex-1">
              <span className="font-semibold">{u.name}</span>
              <span className="block text-sm text-slate-500">
                {u.role === 'owner' ? 'Pemilik' : 'Kasir'} ·{' '}
                {u.pinHash ? 'PIN sudah dibuat' : 'PIN belum dibuat'}
              </span>
            </span>
            <Button onClick={() => setPinFor(u)}>Atur PIN</Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Field label="Tambah kasir">
          <input
            className={inputClass}
            placeholder="Nama kasir"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          className="self-end"
          onClick={async () => {
            try {
              setError(null);
              await addCashier(db, store.id, newName, nowIso());
              setNewName('');
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Tambah
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>

      {pinFor && <SetPinSheet user={pinFor} onClose={() => setPinFor(null)} />}
    </section>
  );
}

function SetPinSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={`PIN untuk ${user.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-center text-slate-600">
          {first ? 'Ulangi PIN baru.' : 'Masukkan PIN baru (4–6 angka).'}
        </p>
        <ErrorText>{error}</ErrorText>
        <PinPad
          key={first ?? 'first'}
          submitLabel={first ? 'Simpan' : 'Lanjut'}
          onSubmit={async (pin) => {
            if (!first) return setFirst(pin);
            if (pin !== first) {
              setFirst(null);
              return setError('PIN tidak sama. Silakan ulangi.');
            }
            await setUserPin(db, user.id, pin, nowIso());
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}
