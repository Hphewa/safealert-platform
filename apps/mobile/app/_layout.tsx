import { Stack } from 'expo-router';

import { AuthProvider } from '../src/features/auth/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'SafeAlert' }} />
        <Stack.Screen name="auth/login" options={{ title: 'Login' }} />
        <Stack.Screen name="auth/register" options={{ title: 'Register' }} />
        <Stack.Screen name="resident/index" options={{ title: 'Resident' }} />
        <Stack.Screen name="volunteer/index" options={{ title: 'Volunteer' }} />
        <Stack.Screen name="officer/index" options={{ title: 'Officer' }} />
        <Stack.Screen name="responder/index" options={{ title: 'Responder' }} />
      </Stack>
    </AuthProvider>
  );
}
