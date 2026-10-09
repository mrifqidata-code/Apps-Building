import { NavLink, Outlet, useNavigate } from 'react-router';
import { signOut } from '../db/auth';
import { db } from '../db/db';
import { InstallButton } from '../pwa/InstallButton';
import { useOnlineStatus } from '../ui/useOnlineStatus';
import { useSession } from './session-context';

export function Layout() {
  const { store, user, isOwner } = useSession();
  const online = useOnlineStatus();
  const navigate = useNavigate();

  const links = [
    { to: '/', label: 'Kasir', end: true },
    { to: '/riwayat', label: 'Riwayat' },
    ...(isOwner
      ? [
          { to: '/produk', label: 'Produk' },
          { to: '/pengaturan', label: 'Pengaturan' },
        ]
      : []),
  ];

  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 bg-teal-700 text-white shadow">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <h1 className="flex-1 truncate text-lg font-bold">{store.name}</h1>
          <InstallButton />
          {user && (
            <button
              type="button"
              className="flex min-h-10 shrink-0 items-center rounded-full bg-white/15 px-3 text-sm font-semibold"
              onClick={async () => {
                await signOut(db);
                navigate('/masuk');
              }}
              aria-label={`${user.name}, ganti pengguna`}
            >
              {user.name} ⇄
            </button>
          )}
          <span
            className="flex shrink-0 items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm"
            data-testid="status-koneksi"
          >
            <span
              aria-hidden
              className={`size-2.5 rounded-full ${online ? 'bg-emerald-300' : 'bg-amber-300'}`}
            />
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
        {user && (
          <div className="flex items-center overflow-x-auto px-2">
            <nav aria-label="Menu utama" className="flex flex-1 gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `flex min-h-12 shrink-0 items-center border-b-4 px-3 text-sm font-semibold ${
                      isActive ? 'border-white' : 'border-transparent text-teal-100'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
