import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FieldConfirmation, GetFieldConfirmationsResponse } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiRequest } from '@/services/api/client';
import { resolveMediaReferenceUri } from '../../shared/media/mediaReference';
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
      } catch {
        if (active) setError('Volunteer field checks could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [accessToken, reportId, retry]));

  return <View style={styles.card}>
    <Text style={styles.title}>Volunteer Field Confirmations</Text>
    {loading ? <ActivityIndicator /> : error ? <>
      <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}><Text style={styles.link}>Retry</Text></Pressable>
    </> : items.length ? items.map((item) => <View key={item.id} style={styles.item}>
      <Text style={styles.title}>{item.outcome === 'CONFIRMED' ? 'Current Situation Confirmed' : 'Unable to Confirm'}</Text>
      <Text style={styles.text}>Submitted: {new Date(item.createdAt).toLocaleString()}</Text>
      {item.outcome === 'CONFIRMED' ? <View style={styles.stack}>
        <ChecklistRow label="Location matches" value={item.verificationChecklist.locationMatches} />
        <ChecklistRow label="Photo matches" value={item.verificationChecklist.photoMatches} />
        <ChecklistRow label="Situation still exists" value={item.verificationChecklist.situationStillExists} />
        <ChecklistRow label="Severity appears correct" value={item.verificationChecklist.severityAppearsCorrect} />
        {item.observation ? <>
          <Text style={styles.subtitle}>Observation</Text>
          <Text style={styles.text}>{item.observation}</Text>
        </> : null}
        {item.mediaReference && resolveMediaReferenceUri(item.mediaReference) ? (
          <Image accessibilityLabel="Volunteer field evidence" source={{ uri: resolveMediaReferenceUri(item.mediaReference)! }} style={styles.mediaPreview} />
        ) : null}
      </View> : <View style={styles.stack}>
        <Text style={styles.subtitle}>Reason</Text>
        <Text style={styles.text}>{item.reason}</Text>
        {item.reasonDetails ? <Text style={styles.text}>{item.reasonDetails}</Text> : null}
      </View>}
    </View>) : <Text style={styles.text}>No community field check has been submitted yet.</Text>}
  </View>;
}

function ChecklistRow({ label, value }: { label: string; value: boolean }) {
  return <Text style={styles.text}>{value ? 'Yes' : 'No'} - {label}</Text>;
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 14, backgroundColor: dashboardTheme.colors.surface, borderRadius: dashboardTheme.radius.md },
  item: { gap: 8, borderTopWidth: 1, borderTopColor: dashboardTheme.colors.border, paddingTop: 12 },
  title: { color: dashboardTheme.colors.text, fontSize: 17, fontWeight: '700' },
  subtitle: { color: dashboardTheme.colors.text, fontSize: 14, fontWeight: '800' },
  text: { color: dashboardTheme.colors.muted, lineHeight: 22 },
  link: { color: dashboardTheme.colors.primary, padding: 12 },
  stack: { gap: 6 },
  mediaPreview: { width: '100%', height: 180, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted }
});
