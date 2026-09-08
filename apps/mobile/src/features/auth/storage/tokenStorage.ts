import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const accessTokenKey = 'safealert.accessToken';
const refreshTokenKey = 'safealert.refreshToken';

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
};

const isWeb = Platform.OS === 'web';

function webStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export async function saveSession(session: StoredSession) {
  if (isWeb && webStorageAvailable()) {
    window.localStorage.setItem(accessTokenKey, session.accessToken);
    window.localStorage.setItem(refreshTokenKey, session.refreshToken);
    return;
  }

  await SecureStore.setItemAsync(accessTokenKey, session.accessToken);
  await SecureStore.setItemAsync(refreshTokenKey, session.refreshToken);
}

export async function readSession(): Promise<StoredSession | null> {
  if (isWeb && webStorageAvailable()) {
    const accessToken = window.localStorage.getItem(accessTokenKey);
    const refreshToken = window.localStorage.getItem(refreshTokenKey);

    if (!accessToken || !refreshToken) {
      return null;
    }

    return { accessToken, refreshToken };
  }

  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(accessTokenKey),
    SecureStore.getItemAsync(refreshTokenKey)
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

export async function clearSession() {
  if (isWeb && webStorageAvailable()) {
    window.localStorage.removeItem(accessTokenKey);
    window.localStorage.removeItem(refreshTokenKey);
    return;
  }

  await Promise.all([
    SecureStore.deleteItemAsync(accessTokenKey),
    SecureStore.deleteItemAsync(refreshTokenKey)
  ]);
}
