import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SafeUser } from '@safealert/contracts';

const accessTokenKey = 'safealert.accessToken';
const refreshTokenKey = 'safealert.refreshToken';
const userKey = 'safealert.cachedUser';

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user?: SafeUser;
};

const isWeb = Platform.OS === 'web';

function webStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export async function saveSession(session: StoredSession, user?: SafeUser) {
  if (isWeb && webStorageAvailable()) {
    window.localStorage.setItem(accessTokenKey, session.accessToken);
    window.localStorage.setItem(refreshTokenKey, session.refreshToken);
    if (user) window.localStorage.setItem(userKey, JSON.stringify(user));
    return;
  }

  await SecureStore.setItemAsync(accessTokenKey, session.accessToken);
  await SecureStore.setItemAsync(refreshTokenKey, session.refreshToken);
  if (user) await SecureStore.setItemAsync(userKey, JSON.stringify(user));
}

export async function readSession(): Promise<StoredSession | null> {
  if (isWeb && webStorageAvailable()) {
    const accessToken = window.localStorage.getItem(accessTokenKey);
    const refreshToken = window.localStorage.getItem(refreshTokenKey);
    const cachedUser = window.localStorage.getItem(userKey);

    if (!accessToken || !refreshToken) {
      return null;
    }

    return { accessToken, refreshToken, ...(cachedUser ? { user: JSON.parse(cachedUser) as SafeUser } : {}) };
  }

  const [accessToken, refreshToken, cachedUser] = await Promise.all([
    SecureStore.getItemAsync(accessTokenKey),
    SecureStore.getItemAsync(refreshTokenKey),
    SecureStore.getItemAsync(userKey)
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken, ...(cachedUser ? { user: JSON.parse(cachedUser) as SafeUser } : {}) };
}

export async function clearSession() {
  if (isWeb && webStorageAvailable()) {
    window.localStorage.removeItem(accessTokenKey);
    window.localStorage.removeItem(refreshTokenKey);
    window.localStorage.removeItem(userKey);
    return;
  }

  await Promise.all([
    SecureStore.deleteItemAsync(accessTokenKey),
    SecureStore.deleteItemAsync(refreshTokenKey),
    SecureStore.deleteItemAsync(userKey)
  ]);
}
