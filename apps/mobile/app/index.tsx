import { StatusBar } from 'expo-status-bar';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../src/features/auth/hooks/useAuth';
import { routeForRole } from '../src/features/auth/utils/roleRoutes';

export default function HomeScreen() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
        <Text style={styles.body}>Checking your session...</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (status === 'authenticated' && user) {
    return <Redirect href={routeForRole(user.role)} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SafeAlert</Text>
      <Text style={styles.subtitle}>Authentication foundation</Text>
      <Text style={styles.body}>Sign in or create a Resident account to continue.</Text>
      <Redirect href="/auth/login" />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#f8fafc'
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0f172a'
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0369a1'
  },
  body: {
    maxWidth: 360,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    color: '#334155'
  }
});
