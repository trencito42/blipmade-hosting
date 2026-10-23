import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, get, onUnauthorized, post, type SessionUser } from './lib/api';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  /** The state of the session, in one word. */
  status: SessionStatus;
  error: string | null;
  /**
   * The answer of the API when an account was created. It says whether the
   * confirmation could really be sent, so the page never claims that a
   * message is on its way while the relay is not configured.
   */
  registrationNotice: string | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionState>({
  user: null,
  loading: true,
  status: 'loading',
  error: null,
  registrationNotice: null,
  refresh: async () => {},
  login: async () => {
    throw new Error('not ready');
  },
  register: async () => {
    throw new Error('not ready');
  },
  logout: async () => {},
});

export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [registrationNotice, setRegistrationNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await get<{ user: SessionUser | null }>('/auth/session');
      setUser(data.user);
      setError(null);
    } catch (err) {
      setUser(null);
      setError(err instanceof ApiError ? err.message : 'Cannot reach the Blipmade API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A session that ends while the page is open clears the user, so the guard
  // of the pages that need a session sends the visitor to the login.
  useEffect(() => {
    onUnauthorized(() => setUser(null));
    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await post<{ user: SessionUser }>('/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    const data = await post<{ user: SessionUser; mail?: { state?: string; message?: string } }>('/auth/register', {
      email,
      password,
      firstName,
      lastName,
    });
    setUser(data.user);
    // The answer of the API says whether the confirmation could really be
    // sent. The page shows that answer and never claims that a message is on
    // its way while the relay is not configured.
    setRegistrationNotice(data.mail?.message ?? null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<SessionState>(
    () => ({ user, loading, status: loading ? 'loading' : user ? 'authenticated' : 'anonymous', error, registrationNotice, refresh, login, register, logout }),
    [user, loading, error, registrationNotice, refresh, login, register, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
