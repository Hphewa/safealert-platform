import { Stack } from 'expo-router';

import { AuthProvider } from '../src/features/auth/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
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
