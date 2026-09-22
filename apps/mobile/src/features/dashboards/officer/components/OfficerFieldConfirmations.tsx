import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FieldConfirmation, GetFieldConfirmationsResponse } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiRequest } from '@/services/api/client';
import { dashboardTheme } from '../../shared/theme';

export function OfficerFieldConfirmations({ reportId }: { reportId: string }) {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<FieldConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError(null); setItems([]);
    void (async () => {
      try {
        if (!accessToken) throw new Error('Officer session is unavailable.');
        const response = await apiRequest<GetFieldConfirmationsResponse>(`/field-confirmations/${encodeURIComponent(reportId)}`, { accessToken });
        if (active) setItems(response.confirmations);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load field confirmations.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [accessToken, reportId, retry]));
  return <View style={styles.card}>
    <Text style={styles.title}>Volunteer Confirmations & Flags</Text>
    {loading ? <ActivityIndicator /> : error ? <>
      <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}><Text style={styles.link}>Retry</Text></Pressable>
    </> : items.length ? items.map((item) => <View key={item.id} style={styles.item}>
      <Text style={styles.title}>{item.outcome === 'CONFIRMED' ? 'Current Situation Confirmed' : 'Unable to Confirm'}</Text>
      <Text style={styles.text}>Status: {item.status} · {new Date(item.createdAt).toLocaleString()}</Text>
      <Text style={styles.text}>Volunteer: {item.volunteerId}</Text>
      {item.outcome === 'UNABLE_TO_CONFIRM' ? <Text style={styles.text}>{item.reason}{item.reasonDetails ? `: ${item.reasonDetails}` : ''}</Text> : null}
    </View>) : <Text style={styles.text}>No volunteer confirmations or flags submitted yet.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 20, gap: 14, backgroundColor: dashboardTheme.colors.surface, borderRadius: dashboardTheme.radius.md },
  item: { gap: 8, borderTopWidth: 1, borderTopColor: dashboardTheme.colors.border, paddingTop: 12 },
  title: { color: dashboardTheme.colors.text, fontSize: 17, fontWeight: '700' },
  text: { color: dashboardTheme.colors.muted, lineHeight: 22 },
  link: { color: dashboardTheme.colors.primary, padding: 12 }
});
