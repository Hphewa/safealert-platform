import { Stack } from 'expo-router';

import { AuthProvider } from '../src/features/auth/context/AuthContext';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

function NotificationTapHandler() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    let remove: (() => void) | undefined;
    void import('expo-notifications').then(async (notifications) => {
      const openWarning = (response: { notification?: { request?: { content?: { data?: Record<string, unknown> } } } }) => {
        const warningId = response.notification?.request?.content?.data?.warningId;
        if (active && typeof warningId === 'string' && warningId) {
          router.push({ pathname: '/resident/warnings/[warningId]', params: { warningId } });
        }
      };
      const subscription = notifications.addNotificationResponseReceivedListener(openWarning);
      remove = () => subscription.remove();
      const initial = await notifications.getLastNotificationResponseAsync();
      if (initial) openWarning(initial as Parameters<typeof openWarning>[0]);
    }).catch(() => undefined);
    return () => { active = false; remove?.(); };
  }, [router]);
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationTapHandler />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'SafeAlert' }} />
        <Stack.Screen name="auth/login" options={{ title: 'Login' }} />
        <Stack.Screen name="auth/register" options={{ title: 'Register' }} />
        <Stack.Screen name="resident" options={{ headerShown: false }} />
        <Stack.Screen name="volunteer" options={{ headerShown: false }} />
        <Stack.Screen name="officer" options={{ headerShown: false }} />
        <Stack.Screen name="responder" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
