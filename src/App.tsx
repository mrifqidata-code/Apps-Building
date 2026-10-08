import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { bootstrap } from './db/bootstrap';
import { db } from './db/db';
import { KasirPage } from './features/kasir/KasirPage';
import { InstallButton } from './pwa/InstallButton';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { useOnlineStatus } from './ui/useOnlineStatus';

export function App() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap()
      .then(setStoreId)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-lg font-bold">Aplikasi gagal dimuat</h1>
        <p className="mt-2 text-slate-600">{error}</p>
      </main>
    );
  }
  if (!storeId) {
    return <main className="p-6 text-slate-500">Memuat…</main>;
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header storeId={storeId} />
      <main className="flex-1">
        <KasirPage storeId={storeId} />
      </main>
      <UpdatePrompt />
    </div>
  );
}

function Header({ storeId }: { storeId: string }) {
  const store = useLiveQuery(() => db.stores.get(storeId), [storeId]);
  const online = useOnlineStatus();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 bg-teal-700 px-4 py-3 text-white shadow">
      <h1 className="flex-1 truncate text-lg font-bold">{store?.name ?? 'POS Sederhana'}</h1>
      <InstallButton />
      <span
        className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm"
        data-testid="status-koneksi"
      >
        <span
          aria-hidden
          className={`size-2.5 rounded-full ${online ? 'bg-emerald-300' : 'bg-amber-300'}`}
        />
        {online ? 'Online' : 'Offline'}
      </span>
    </header>
  );
}
