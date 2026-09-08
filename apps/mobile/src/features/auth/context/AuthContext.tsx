import type { AuthResponse, LoginRequest, RegisterRequest, SafeUser } from '@safealert/contracts';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as authApi from '../api/authApi';
import { clearSession, readSession, saveSession } from '../storage/tokenStorage';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: SafeUser | null;
  accessToken: string | null;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SafeUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const applyAuthResponse = useCallback(async (response: AuthResponse) => {
    await saveSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken
    });
    setUser(response.user);
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);
    setStatus('authenticated');
  }, []);

  const clearLocalAuth = useCallback(async () => {
    await clearSession();
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const storedSession = await readSession();

        if (!storedSession) {
          if (mounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        const refreshedSession = await authApi.refresh({
          refreshToken: storedSession.refreshToken
        });
        await saveSession({
          accessToken: refreshedSession.accessToken,
          refreshToken: refreshedSession.refreshToken
        });
        const currentUser = await authApi.me(refreshedSession.accessToken);

        if (mounted) {
          setUser(currentUser.user);
          setAccessToken(refreshedSession.accessToken);
          setRefreshToken(refreshedSession.refreshToken);
          setStatus('authenticated');
        }
      } catch {
        await clearSession();

        if (mounted) {
          setUser(null);
          setAccessToken(null);
          setRefreshToken(null);
          setStatus('unauthenticated');
        }
      }
    }

    void restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(
    async (input: LoginRequest) => {
      const response = await authApi.login(input);
      await applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      const response = await authApi.registerResident(input);
      await applyAuthResponse(response);
    },
    [applyAuthResponse]
  );

  const logout = useCallback(async () => {
    const tokenToRevoke = refreshToken;

    await clearLocalAuth();

    if (tokenToRevoke) {
      try {
        await authApi.logout({ refreshToken: tokenToRevoke });
      } catch {
        // Local credentials are cleared first so offline logout does not trap the user in the app.
      }
    }
  }, [clearLocalAuth, refreshToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      accessToken,
      login,
      register,
      logout
    }),
    [accessToken, login, logout, register, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
