import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { registerPushToken } from './api/notificationApi';

// Expo's Android device token is FCM. On iOS it is APNs, which this FCM backend
// cannot use directly. Never register an APNs or Expo push-service token here.
export function useNativePushRegistration(accessToken: string | null) {
  const [status, setStatus] = useState('Not registered');
  const registeredToken = useRef<string | null>(null);
  const queuedToken = useRef<string | null>(null);
  useEffect(() => {
    registeredToken.current = null;
    queuedToken.current = null;
    if (!accessToken) return;
    if (Platform.OS !== 'android' || Constants.appOwnership === 'expo') {
      setStatus('Not registered — native FCM registration requires a configured Android development build.');
      return;
    }
    let active = true;
    let remove: (() => void) | undefined;
    let queue = Promise.resolve();
    const save = (data: unknown) => {
      if (!active || typeof data !== 'string' || !data.trim() || /^(ExpoPushToken|ExponentPushToken)\[/.test(data) || data === registeredToken.current || data === queuedToken.current) return;
      queuedToken.current = data;
      queue = queue.then(async () => {
        if (!active || data === registeredToken.current) return;
        await registerPushToken(data, accessToken);
        registeredToken.current = data;
        if (active) setStatus('Registered');
      }).catch(() => { if (active) setStatus('Push registration could not be saved. Check your connection and sign in again.'); })
        .finally(() => { if (queuedToken.current === data) queuedToken.current = null; });
    };
    void (async () => {
      const notifications = await import('expo-notifications');
      await notifications.setNotificationChannelAsync('warnings', { name: 'Warning alerts', importance: notifications.AndroidImportance.HIGH });
      const permission = await notifications.requestPermissionsAsync();
      if (!active) return;
      if (!permission.granted) { setStatus('Not registered — notification permission is disabled.'); return; }
      const subscription = notifications.addPushTokenListener(token => save(token.data));
      remove = () => subscription.remove();
      const token = await notifications.getDevicePushTokenAsync();
      save(token.data);
    })().catch(() => { if (active) setStatus('Not registered — check the Android Firebase configuration.'); });
    return () => { active = false; remove?.(); };
  }, [accessToken]);
  return status;
}
