import { createContext, useContext } from 'react';
import type { Device, Store, User } from '../db/schema';

export interface Session {
  store: Store;
  device: Device;
  /** Null until someone signs in with their PIN. */
  user: User | null;
  isOwner: boolean;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession dipakai di luar SessionProvider');
  return session;
}

/** For screens that only render after sign-in (guarded by RequireUser). */
export function useSignedInUser(): User {
  const { user } = useSession();
  if (!user) throw new Error('Belum masuk');
  return user;
}
