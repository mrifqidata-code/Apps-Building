import { useState } from 'react';
import { useSession, useSignedInUser } from '../../app/session-context';
import { updateStoreSettings } from '../../db/catalog-admin';
import { db } from '../../db/db';
import { saveImage } from '../../db/images';
import { nowIso } from '../../domain/time';
import { errorMessage } from '../../ui/errors';
import { resizeImage, useImageUrl } from '../../ui/images';
import { Button, ErrorText, FilePickerButton } from '../../ui/kit';

// QR codes need enough pixels to stay scannable from a phone screen.
const QRIS_MAX_PX = 1200;

export function QrisSection() {
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
