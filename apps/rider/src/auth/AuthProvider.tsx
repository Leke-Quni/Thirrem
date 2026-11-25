import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from './auth-api';
import { shouldEndSession } from './session-check';

export const TOKEN_KEY = 'thirrem-rider-token';

interface AuthState {
  email: string | null;
  loading: boolean;
  unreachable: boolean;
  /** The server rejected the stored session, so the Rider has to log in again. */
  expired: boolean;
  retry(): void;
  signup(email: string, password: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => localStorage.getItem(TOKEN_KEY) !== null);

  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    let current = true;
    setLoading(true);
    setUnreachable(false);
    authApi
      .me(token)
      .then((me) => {
        if (current) setEmail(me.email);
      })
      .catch((error: unknown) => {
        if (!current) return;
        if (shouldEndSession(error)) {
          localStorage.removeItem(TOKEN_KEY);
          if (current) setExpired(true);
        } else setUnreachable(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const open = useCallback((session: { email: string; token: string }) => {
    localStorage.setItem(TOKEN_KEY, session.token);
    setEmail(session.email);
    setExpired(false);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      email,
      loading,
      unreachable,
      expired,
      retry,
      signup: async (e, p) => open(await authApi.signup(e, p)),
      login: async (e, p) => open(await authApi.login(e, p)),
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        setEmail(null);
        setExpired(false);
      },
    }),
    [email, loading, unreachable, expired, retry, open],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
