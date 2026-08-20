import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { REPORT_STATUSES, USER_ROLES } from '@safealert/contracts';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>SafeAlert</Text>
      <Text style={styles.subtitle}>Foundation app shell</Text>
      <Text style={styles.body}>
        {USER_ROLES.length} roles and {REPORT_STATUSES.length} report statuses are loaded from shared contracts.
      </Text>
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
