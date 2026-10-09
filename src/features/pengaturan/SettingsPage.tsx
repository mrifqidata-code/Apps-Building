import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useSession, useSignedInUser } from '../../app/session-context';
import { addCashier, setUserPin } from '../../db/auth';
import { updateStoreSettings } from '../../db/catalog-admin';
import { db } from '../../db/db';
import { saveImage } from '../../db/images';
import type { User } from '../../db/schema';
import { nowIso } from '../../domain/time';
import { resizeImage, useImageUrl } from '../../ui/images';
import { Button, ErrorText, Field, FilePickerButton, Sheet, inputClass } from '../../ui/kit';
import { errorMessage } from '../../ui/errors';
import { PinPad } from '../../ui/PinPad';

// QR codes need enough pixels to stay scannable from a phone screen.
const QRIS_MAX_PX = 1200;

export function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-xl font-bold">Pengaturan</h1>
      <QrisSection />
      <UsersSection />
      <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-600">
        Nama toko, alamat, logo, catatan struk, pajak PB1, biaya layanan, dan printer bisa diatur
        mulai M2.
      </p>
    </main>
  );
}

function QrisSection() {
  const { store, device } = useSession();
  const user = useSignedInUser();
  const qrisUrl = useImageUrl(store.qrisImageId);
  const [error, setError] = useState<string | null>(null);

  const setQris = async (imageId: string | null) =>
    updateStoreSettings(
      db,
      store.id,
      { qrisImageId: imageId },
      { userId: user.id, deviceId: device.id },
      nowIso(),
    );

  return (
    <section
      aria-label="QRIS toko"
      className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <div>
        <h2 className="text-lg font-semibold">QRIS toko</h2>
        <p className="text-sm text-slate-600">
          Unggah gambar QRIS statis dari bank atau e-wallet Anda. Gambar ini ditampilkan ke
          pelanggan saat memilih bayar QRIS.
        </p>
      </div>
      {qrisUrl ? (
        <img
          src={qrisUrl}
          alt="QRIS toko"
          className="w-full max-w-xs self-center rounded-xl ring-1 ring-slate-200"
        />
      ) : (
        <p className="text-sm text-amber-800">Belum ada gambar QRIS.</p>
      )}
      <FilePickerButton
        label={qrisUrl ? 'Ganti gambar QRIS' : 'Unggah gambar QRIS'}
        onFile={async (file) => {
          try {
            setError(null);
            const blob = await resizeImage(file, QRIS_MAX_PX, 0.92);
            await setQris(await saveImage(db, store.id, blob, nowIso()));
          } catch (err) {
            setError(`Gambar gagal diproses: ${errorMessage(err)}`);
          }
        }}
      />
      {qrisUrl && (
        <Button variant="danger" onClick={() => setQris(null)}>
          Hapus QRIS
        </Button>
      )}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}

function UsersSection() {
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
