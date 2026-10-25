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
  /**
   * The answer of the platform when the account was suspended.
   *
   * The session of a suspended account ends, and the customer is told why
   * instead of being sent to a login that would refuse them.
   */
  suspensionNotice: string | null;
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
  suspensionNotice: null,
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
  const [suspensionNotice, setSuspensionNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await get<{ user: SessionUser | null }>('/auth/session');
      setUser(data.user);
      setError(null);
    } catch (err) {
      setUser(null);
      // The account was suspended: the customer is told what happened, and
      // the message of the platform says where to write.
      if (err instanceof ApiError && err.code === 'account_suspended') {
        setSuspensionNotice(err.message);
        setError(null);
      } else {
        setError(err instanceof ApiError ? err.message : 'Cannot reach the Blipmade API.');
      }
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
    onUnauthorized((code) => {
      setUser(null);
      // The account was suspended while the page was open. The visitor is
      // sent to the login, and the login says why.
      if (code === 'account_suspended') {
        setSuspensionNotice('This account is suspended. Contact support to have it restored.');
        setError(null);
      }
    });
    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await post<{ user: SessionUser }>('/auth/login', { email, password });
    // The answer of the sign-in does not carry the permissions of a staff
    // member, so the session is read afterwards. Without that, a staff member
    // with a limited set of permissions would see the whole administration
    // area as read-only until the page is reloaded by hand.
    try {
      const session = await get<{ user: SessionUser | null }>('/auth/session');
      if (session.user) {
        setUser(session.user);
        return session.user;
      }
    } catch {
      // The session answer is the one that counts, but a sign-in that worked
      // must not fail because the second read did not.
    }
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
    () => ({
      user,
      loading,
      status: loading ? 'loading' : user ? 'authenticated' : 'anonymous',
      error,
      registrationNotice,
      suspensionNotice,
      refresh,
      login,
      register,
      logout,
    }),
    [user, loading, error, registrationNotice, suspensionNotice, refresh, login, register, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
