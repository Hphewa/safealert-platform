import type { UserRole } from '@safealert/contracts';
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { routeForRole } from '../utils/roleRoutes';

type RoleRouteLayoutProps = {
  allowedRole: UserRole;
};

export function RoleRouteLayout({ allowedRole }: RoleRouteLayoutProps) {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return <Redirect href="/auth/login" />;
  }

  if (user.role !== allowedRole) {
    return <Redirect href={routeForRole(user.role)} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc'
  }
});
