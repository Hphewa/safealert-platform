import type { UserRole } from '@safealert/contracts';
import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { routeForRole } from '../utils/roleRoutes';

type RoleHomeScreenProps = {
  allowedRole: UserRole;
  title: string;
  description: string;
};

export function RoleHomeScreen({ allowedRole, title, description }: RoleHomeScreenProps) {
  const { status, user, logout } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <ActivityIndicator />
      </View>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return <Redirect href="/auth/login" />;
  }

  if (user.role !== allowedRole) {
    return <Redirect href={routeForRole(user.role)} />;
  }

  return (
    <View style={styles.screen}>
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{description}</Text>
      </View>
      <Text style={styles.body}>
        Logged in as {user.name} ({user.role})
      </Text>
      <Pressable onPress={logout} style={styles.button}>
        <Text style={styles.buttonText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: '#f8fafc'
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827'
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    color: '#475569'
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: '#334155'
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#dc2626'
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff'
  }
});
