import { useState } from 'react';
import { useSession, useSignedInUser } from '../../app/session-context';
import { ValidationError, updateStoreSettings } from '../../db/catalog-admin';
import { db } from '../../db/db';
import { saveImage } from '../../db/images';
import { nowIso } from '../../domain/time';
import { errorMessage } from '../../ui/errors';
import { resizeImage, useImageUrl } from '../../ui/images';
import { Button, ErrorText, Field, FilePickerButton, inputClass } from '../../ui/kit';

// Logo is printed at most 256 dots wide; keep a little more for the screen.
const LOGO_MAX_PX = 512;

/** Name, address, phone, logo and receipt footer. */
export function StoreSection() {
  const { store, device } = useSession();
  const user = useSignedInUser();
  const [form, setForm] = useState({
    name: store.name,
    address: store.address,
    phone: store.phone,
    receiptFooter: store.receiptFooter,
    logoImageId: store.logoImageId,
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const logoUrl = useImageUrl(form.logoImageId);
  const set = (patch: Partial<typeof form>) => {
    setMessage(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  const save = async () => {
    try {
      const name = form.name.trim().replace(/\s+/g, ' ');
      if (!name) throw new ValidationError('Nama toko wajib diisi.');
      if (name.length > 60) throw new ValidationError('Nama toko maksimal 60 huruf.');
      await updateStoreSettings(
        db,
        store.id,
        {
          name,
          address: form.address.trim(),
          phone: form.phone.trim(),
          receiptFooter: form.receiptFooter.trim(),
          logoImageId: form.logoImageId,
        },
        { userId: user.id, deviceId: device.id },
        nowIso(),
      );
      setMessage({ ok: true, text: 'Data toko tersimpan.' });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <section
      aria-label="Data toko"
      className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <div>
        <h2 className="text-lg font-semibold">Data toko</h2>
        <p className="text-sm text-slate-600">Tampil di bagian atas dan bawah struk.</p>
      </div>
      <Field label="Nama toko">
        <input
          className={inputClass}
          value={form.name}
          maxLength={60}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Alamat">
        <textarea
          className={`${inputClass} min-h-20 py-2`}
          value={form.address}
          maxLength={160}
          onChange={(e) => set({ address: e.target.value })}
        />
      </Field>
      <Field label="Nomor telepon (opsional)">
        <input
          className={inputClass}
          inputMode="tel"
          value={form.phone}
          maxLength={20}
          onChange={(e) => set({ phone: e.target.value })}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-700">Logo (opsional)</span>
        <div className="flex flex-wrap items-center gap-3">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo toko"
              className="max-h-20 max-w-40 rounded-lg object-contain ring-1 ring-slate-200"
            />
          )}
          <FilePickerButton
            label={form.logoImageId ? 'Ganti logo' : 'Unggah logo'}
            onFile={async (file) => {
              try {
                const blob = await resizeImage(file, LOGO_MAX_PX, 0.9);
                set({ logoImageId: await saveImage(db, store.id, blob, nowIso()) });
              } catch (e) {
                setMessage({ ok: false, text: `Logo gagal diproses: ${errorMessage(e)}` });
              }
            }}
          />
          {form.logoImageId && (
            <Button variant="ghost" onClick={() => set({ logoImageId: null })}>
              Hapus logo
            </Button>
          )}
        </div>
        <span className="text-sm text-slate-500">
          Logo dicetak hitam putih. Gambar dengan latar putih dan garis tegas hasilnya paling jelas.
        </span>
      </div>
      <Field label="Catatan kaki struk">
        <textarea
          className={`${inputClass} min-h-20 py-2`}
          value={form.receiptFooter}
          maxLength={160}
          placeholder="mis. Terima kasih! IG: @kedaikopi"
          onChange={(e) => set({ receiptFooter: e.target.value })}
        />
      </Field>
      {message && !message.ok && <ErrorText>{message.text}</ErrorText>}
      {message?.ok && (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          {message.text}
        </p>
      )}
      <Button variant="primary" onClick={save}>
        Simpan data toko
      </Button>
    </section>
  );
}
