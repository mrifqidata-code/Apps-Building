import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useSignedInUser } from '../../app/session-context';
import { forgetCloudSession } from '../../cloud/client';
import { useCloudLink } from '../../cloud/hooks';
import { countUnsent, emptyDevice } from '../../cloud/link';
import { syncManager } from '../../cloud/sync-manager';
import { checkPin, pinCheckMessage } from '../../db/auth';
import { db } from '../../db/db';
import { errorMessage } from '../../ui/errors';
import { Button, ErrorText, Sheet } from '../../ui/kit';
import { PinPad } from '../../ui/PinPad';

const section = 'flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200';

/** Starts this phone over from scratch, e.g. before real use or when handing it on. */
export function EmptyDeviceSection() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Kosongkan HP ini" className={section}>
      <h2 className="text-lg font-semibold">Kosongkan HP ini</h2>
      <p className="text-sm text-slate-600">
        Menghapus semua data toko di HP ini, seperti aplikasi yang baru dipasang. Pengaturan printer
        tetap ada.
      </p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Kosongkan HP ini
      </Button>
      {open && <EmptyDeviceSheet onClose={() => setOpen(false)} />}
    </section>
  );
}

function EmptyDeviceSheet({ onClose }: { onClose: () => void }) {
  const owner = useSignedInUser();
  const link = useCloudLink();
  const unsent = useLiveQuery(() => countUnsent(db));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (pin: string) => {
    setBusy(true);
    setError(null);
    const result = await checkPin(db, owner.id, pin);
    if (!result.ok) {
      setBusy(false);
      setError(pinCheckMessage(result));
      return;
    }
    syncManager.stop();
    try {
      // One IndexedDB transaction: either everything is gone or nothing is.
      await emptyDevice(db);
    } catch (e) {
      setBusy(false);
      setError(errorMessage(e));
      void syncManager.start();
      return;
    }
    await forgetCloudSession();
    // A fresh start: the app opens with the demo store, like a new install.
    window.location.replace('/');
  };
  const loading = link === undefined || unsent === undefined;

  return (
    <Sheet title="Kosongkan HP ini" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-slate-700">
          Semua produk, transaksi, kas, stok, pengguna, dan PIN di HP ini akan dihapus. HP ini lalu
          dibuka lagi dengan toko contoh. Ini tidak bisa dibatalkan.
        </p>
        {loading ? null : link === null ? (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
            HP ini tidak terhubung ke cloud, jadi semua data itu hilang selamanya. Ekspor laporan ke
            CSV dulu kalau masih perlu.
          </p>
        ) : unsent.rows > 0 ? (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
            {unsent.sales > 0
              ? `${unsent.sales} penjualan belum terkirim ke cloud dan akan hilang.`
              : `${unsent.rows} perubahan belum terkirim ke cloud dan akan hilang.`}{' '}
            Sambungkan internet dan tunggu status Tersinkron dulu kalau ingin menyimpannya.
          </p>
        ) : (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            Semua data HP ini sudah ada di cloud dan tetap aman di sana. HP ini juga keluar dari
            akun.
            {link.role === 'device' &&
              ' Setelah itu, putus HP ini dari daftar perangkat di HP pemilik.'}
          </p>
        )}
        <div className="flex flex-col items-center gap-3">
          <p className="text-center text-slate-600">Masukkan PIN {owner.name} untuk lanjut.</p>
          <PinPad onSubmit={submit} submitLabel="Kosongkan" busy={busy} />
          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </Sheet>
  );
}
