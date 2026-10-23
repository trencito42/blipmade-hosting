import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, get, post, type SessionUser } from './lib/api';

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionState>({
  user: null,
  loading: true,
  error: null,
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

  const login = useCallback(async (email: string, password: string) => {
    const data = await post<{ user: SessionUser }>('/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    const data = await post<{ user: SessionUser }>('/auth/register', { email, password, firstName, lastName });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, refresh, login, register, logout }),
    [user, loading, error, refresh, login, register, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
