import { StatusBar } from 'expo-status-bar';
import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../src/features/auth/hooks/useAuth';
import { routeForRole } from '../src/features/auth/utils/roleRoutes';
import { BrandLogo } from '../src/features/auth/components/BrandLogo';

export default function HomeScreen() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
        <Text style={styles.body}>Checking your session...</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (status === 'authenticated' && user) {
    return <Redirect href={routeForRole(user.role)} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.heroGlow} />
      <BrandLogo size={78} />
      <Text style={styles.title}>SafeAlert</Text>
      <Text style={styles.subtitle}>Know the risk. Act early.</Text>
      <Text style={styles.body}>Community-powered disaster safety for reporting hazards, receiving warnings, and getting help when it matters.</Text>
      <View style={styles.actions}>
        <Link href="/auth/login" asChild><Pressable style={styles.primaryButton}><Text style={styles.primaryButtonText}>Sign in</Text></Pressable></Link>
        <Link href="/auth/register" asChild><Pressable style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Create resident account</Text></Pressable></Link>
      </View>
      <Text style={styles.note}>Residents can register publicly. Volunteer, officer, and responder access is provisioned separately.</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
    backgroundColor: '#102a43'
  },
  heroGlow: { position: 'absolute', top: -80, right: -90, width: 280, height: 280, borderRadius: 140, backgroundColor: '#17466d', opacity: 0.65 },
  title: {
    marginTop: 4,
    fontSize: 42,
    fontWeight: '900',
    color: '#ffffff'
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#78b7ff'
  },
  body: {
    maxWidth: 360,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    color: '#d9e2ec'
  },
  actions: { width: '100%', maxWidth: 380, gap: 12, marginTop: 12 },
  primaryButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#1473e6' },
  primaryButtonText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
  secondaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: '#78b7ff' },
  secondaryButtonText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
  note: { maxWidth: 360, marginTop: 8, textAlign: 'center', fontSize: 12, lineHeight: 18, color: '#9fb3c8' }
});
