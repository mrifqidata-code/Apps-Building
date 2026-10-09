import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Lets the cashier choose when to load a new version, so a sale is never cut off. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  // "Ready offline" is just good news; let it go away on its own.
  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 p-4 text-sm text-white shadow-lg"
    >
      <p className="flex-1">
        {needRefresh
          ? 'Versi baru tersedia. Muat ulang setelah transaksi selesai.'
          : 'Aplikasi siap dipakai tanpa internet.'}
      </p>
      {needRefresh && (
        <button
          type="button"
          className="rounded-lg bg-teal-500 px-4 py-2 font-semibold"
          onClick={() => updateServiceWorker(true)}
        >
          Muat ulang
        </button>
      )}
      <button
        type="button"
        className="rounded-lg px-3 py-2 text-slate-300"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        Tutup
      </button>
    </div>
  );
}
