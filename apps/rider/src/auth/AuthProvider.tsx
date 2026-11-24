import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from './auth-api';

export const TOKEN_KEY = 'thirrem-rider-token';

interface AuthState {
  email: string | null;
  loading: boolean;
  signup(email: string, password: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => localStorage.getItem(TOKEN_KEY) !== null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    authApi
      .me(token)
      .then((me) => setEmail(me.email))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const open = useCallback((session: { email: string; token: string }) => {
    localStorage.setItem(TOKEN_KEY, session.token);
    setEmail(session.email);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      email,
      loading,
      signup: async (e, p) => open(await authApi.signup(e, p)),
      login: async (e, p) => open(await authApi.login(e, p)),
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        setEmail(null);
      },
    }),
    [email, loading, open],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
