import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../app/session-context';
import {
  cloudErrorMessage,
  createPairingCode,
  revokeDevice,
  type PairingCode,
} from '../../cloud/account';
import { useCloudAuth, useCloudLink, type CloudAuth } from '../../cloud/hooks';
import { syncLabel } from '../../cloud/status-text';
import { syncManager, useSyncStatus } from '../../cloud/sync-manager';
import { db } from '../../db/db';
import type { Device } from '../../db/schema';
import { formatJakartaDateTime } from '../../domain/time';
import { Button, ErrorText } from '../../ui/kit';
import { useOnlineStatus } from '../../ui/useOnlineStatus';

const section = 'flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200';

/** Cloud account, sync status, and the store's devices (pairing codes, disconnecting). */
export function CloudSection() {
  const auth = useCloudAuth();
  const link = useCloudLink();
  const status = useSyncStatus();
  const online = useOnlineStatus();

  if (auth === null) return null;
  if (auth === undefined || link === undefined) return null;

  if (!link) {
    return (
      <section aria-label="Akun & sinkron" className={section}>
        <h2 className="text-lg font-semibold">Akun &amp; sinkron</h2>
        <p className="text-sm text-slate-600">
          Data toko saat ini hanya tersimpan di HP ini. Hubungkan ke akun pemilik supaya ada
          cadangan di cloud dan bisa dipakai di beberapa HP kasir.
        </p>
        <Link
          to="/akun"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-4 font-semibold text-white"
        >
          Hubungkan ke akun pemilik
        </Link>
      </section>
    );
  }

  const ownerSession = link.role === 'owner' && auth.email;
  return (
    <section aria-label="Akun & sinkron" className={section}>
      <h2 className="text-lg font-semibold">Akun &amp; sinkron</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">Status</dt>
        <dd className="font-semibold" data-testid="status-sinkron-detail">
          {syncLabel(status, online)}
        </dd>
        <dt className="text-slate-500">Belum terkirim</dt>
        <dd>{status.pending} data</dd>
        <dt className="text-slate-500">Terakhir sinkron</dt>
        <dd>{status.lastSyncAt ? formatJakartaDateTime(status.lastSyncAt) : 'Belum pernah'}</dd>
        <dt className="text-slate-500">Akun</dt>
        <dd>
          {link.role === 'device'
            ? 'HP kasir (dipasang dengan kode)'
            : (auth.email ?? 'Belum masuk')}
        </dd>
      </dl>
      {status.message && status.phase !== 'idle' && <ErrorText>{status.message}</ErrorText>}
      {status.failed > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {status.failed} data ditolak server dan akan dicoba lagi. Kalau terus terjadi, hubungi
          pembuat aplikasi.
        </p>
      )}

      {status.phase === 'revoked' ? (
        <p className="text-sm text-slate-600">
          HP ini sudah diputus dari toko. Data lama tetap ada di HP ini, tapi tidak tersinkron lagi.
          Untuk menyambung lagi, pasang ulang dengan kode baru dari pemilik.
        </p>
      ) : (
        <Button onClick={() => void syncManager.syncNow()} disabled={status.phase === 'syncing'}>
          Sinkron sekarang
        </Button>
      )}

      {link.role === 'owner' && !auth.email && (
        <Link
          to="/akun"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-4 font-semibold text-white"
        >
          Masuk lagi ke akun pemilik
        </Link>
      )}
      {link.role === 'device' && (status.phase === 'revoked' || status.phase === 'signed-out') && (
        <Link
          to="/pasang"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-4 font-semibold text-white"
        >
          Pasang ulang HP ini
        </Link>
      )}

      <Devices auth={ownerSession ? auth : null} />

      {ownerSession && (
        <Button variant="ghost" onClick={() => auth.client.auth.signOut()}>
          Keluar dari akun di HP ini
        </Button>
      )}
    </section>
  );
}

/** Devices of the store. With the owner signed in: add a cashier phone or disconnect one. */
function Devices({ auth }: { auth: CloudAuth | null }) {
  const { store, device: thisDevice } = useSession();
  const devices = useLiveQuery(
    () => db.devices.where({ storeId: store.id }).sortBy('code'),
    [store.id],
  );
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [confirming, setConfirming] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(cloudErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
      <h3 className="font-semibold">Perangkat</h3>
      <ul className="flex flex-col divide-y divide-slate-100" aria-label="Daftar perangkat">
        {devices?.map((d) => (
          <li key={d.id} className="flex min-h-14 items-center gap-3 py-1">
            <span className="flex-1">
              <span className="font-semibold">
                {d.code} · {d.name}
              </span>
              <span className="block text-sm text-slate-500">
                {d.id === thisDevice.id
                  ? 'HP ini'
                  : !d.active
                    ? 'Sudah diputus'
                    : d.lastSeenAt
                      ? `Terakhir aktif ${formatJakartaDateTime(d.lastSeenAt)}`
                      : 'Belum pernah sinkron'}
              </span>
            </span>
            {auth && d.active && d.id !== thisDevice.id && (
              <Button variant="danger" disabled={busy} onClick={() => setConfirming(d)}>
                Putus
              </Button>
            )}
          </li>
        ))}
      </ul>

      {confirming && auth && (
        <div className="flex flex-col gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-900">
          <p>
            Putus {confirming.code} ({confirming.name})? HP itu tidak bisa sinkron lagi. Transaksi
            yang sudah terkirim tetap aman.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await revokeDevice(auth.client, confirming.id);
                  setConfirming(null);
                  await syncManager.syncNow();
                })
              }
            >
              Ya, putus
            </Button>
            <Button onClick={() => setConfirming(null)}>Batal</Button>
          </div>
        </div>
      )}

      {auth ? (
        pairing ? (
          <div className="flex flex-col gap-2 rounded-xl bg-teal-50 p-4 text-center">
            <p className="text-sm text-teal-900">Kode pasang HP kasir</p>
            <p
              className="font-mono text-4xl font-bold tracking-widest text-teal-900 select-text"
              data-testid="kode-pasang"
            >
              {pairing.code}
            </p>
            <p className="text-sm text-teal-900">
              Berlaku sampai {formatJakartaDateTime(pairing.expiresAt)} WIB, hanya untuk satu HP.
            </p>
            <ol className="list-decimal pl-5 text-left text-sm text-slate-700">
              <li>Di HP kasir, buka aplikasi ini.</li>
              <li>Di layar &quot;Siapa yang bertugas?&quot;, ketuk &quot;Pasang HP kasir&quot;.</li>
              <li>Ketik kode di atas, lalu ketuk &quot;Pasang HP ini&quot;.</li>
            </ol>
            <Button onClick={() => setPairing(null)}>Selesai</Button>
          </div>
        ) : (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              act(async () => setPairing(await createPairingCode(auth.client, store.id)))
            }
          >
            Tambah HP kasir
          </Button>
        )
      ) : (
        <p className="text-sm text-slate-500">
          Menambah atau memutus HP kasir dilakukan dari HP yang masuk dengan email pemilik.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
