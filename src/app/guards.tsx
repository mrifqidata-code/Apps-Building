import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { signOut } from '../db/auth';
import { db } from '../db/db';
import { Button } from '../ui/kit';
import { useSession } from './session-context';

export function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const location = useLocation();
  if (!user) return <Navigate to="/masuk" replace state={{ from: location.pathname }} />;
  return children;
}

export function RequireOwner({ children }: { children: ReactNode }) {
  const { isOwner } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  if (isOwner) return children;
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">Khusus pemilik</h1>
      <p className="text-slate-600">Halaman ini hanya bisa dibuka oleh pemilik toko.</p>
      <Button
        variant="primary"
        onClick={async () => {
          await signOut(db);
          navigate('/masuk', { state: { from: location.pathname } });
        }}
      >
        Masuk sebagai pemilik
      </Button>
    </main>
  );
}
