import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { getNotificationProfile, updateNotificationProfile } from '../api/notificationApi';
import type { NotificationProfile } from '@safealert/contracts';
import { WARNING_DISTRICTS, NOTIFICATION_COUNTRY, normalizeNotificationLocation } from '@safealert/contracts';
import { ApiClientError } from '../../../services/api/client';
import { useNativePushRegistration } from '../useNativePushRegistration';
import { DashboardHeader } from '../../dashboards/shared/components/DashboardHeader';
import { DashboardScreen } from '../../dashboards/shared/components/DashboardScreen';
import { dashboardTheme } from '../../dashboards/shared/theme';
import { residentBottomNavItems } from '../../dashboards/resident/mockData';

const fields = [
  { key: 'area', label: 'Area / Locality', placeholder: 'Your existing locality name' },
  { key: 'phoneNumber', label: 'Phone number', placeholder: 'e.g. 0771234567', keyboardType: 'phone-pad' as const }
] as const;

export function NotificationProfileScreen() {
  const { accessToken } = useAuth();
  const [profile, setProfile] = useState<NotificationProfile>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const pushStatus = useNativePushRegistration(accessToken);
  const describeError = (failure: unknown) => failure instanceof ApiClientError
    ? failure.status === 401 ? 'Your session has expired. Sign in again.' : `${failure.message} (${failure.code})`
    : 'Unable to complete the request. Please retry.';

  const load = useCallback(() => {
    if (!accessToken) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    setLoaded(false);
    void getNotificationProfile(accessToken)
      .then((result) => {
        setProfile(result.profile);
        setLoaded(true);
        setValues({
          area: result.profile.area ?? '',
          district: result.profile.district ?? '',
          country: result.profile.country ?? '',
          phoneNumber: result.profile.phoneNumber ?? ''
        });
      })
      .catch(failure => setError(describeError(failure)))
      .finally(() => setLoading(false));
  }, [accessToken]);
  useEffect(load, [load]);

  const save = async () => {
    if (!accessToken || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateNotificationProfile({
        area: values.area?.trim() || null,
        district: values.district?.trim() || null,
        country: NOTIFICATION_COUNTRY,
        phoneNumber: values.phoneNumber?.trim() || null
      }, accessToken);
      setProfile(result.profile);
      setMessage('Resident profile saved.');
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems}>
      <DashboardHeader title="Resident Profile" description="Where you live and how we can contact you about warnings." />
      <View style={styles.card}>
        <Text style={styles.label}>LOCATION & CONTACT</Text>
        {loading ? <ActivityIndicator color={dashboardTheme.colors.primary} /> : fields.map((field) => (
          <View key={field.key} style={styles.field}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              value={values[field.key] ?? ''}
              onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
              placeholder={field.placeholder}
              placeholderTextColor={dashboardTheme.colors.muted}
              keyboardType={'keyboardType' in field ? field.keyboardType : 'default'}
              autoCapitalize="words"
              style={styles.input}
              editable={loaded && !saving}
            />
          </View>
        ))}

        <Text style={styles.label}>District</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {WARNING_DISTRICTS.map(district => {
            const selected = normalizeNotificationLocation(values.district) === normalizeNotificationLocation(district);
            return <Pressable key={district} accessibilityRole="radio" accessibilityState={{ checked: selected }}
              disabled={!loaded || saving} onPress={() => setValues(current => ({ ...current, district }))}
              style={[styles.input, { justifyContent: 'center', backgroundColor: selected ? dashboardTheme.colors.primarySoft : dashboardTheme.colors.surface }]}>
              <Text>{district}</Text>
            </Pressable>;
          })}
        </View>
        <Text style={styles.label}>Country</Text>
        <Text>{NOTIFICATION_COUNTRY}</Text>

        <View style={styles.pushStatus}>
          <Text style={styles.label}>Push notification status</Text>
          <Text style={styles.statusText}>{pushStatus || (profile.pushToken ? 'Registered on your account' : 'Not registered')}</Text>
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {!loaded && !loading ? <Pressable accessibilityRole="button" onPress={load}><Text>Retry loading profile</Text></Pressable> : null}
        <Pressable disabled={saving || loading || !loaded} onPress={() => void save()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save notification profile'}</Text>
        </Pressable>
      </View>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 18, borderRadius: 18, backgroundColor: dashboardTheme.colors.surface, borderWidth: 1, borderColor: dashboardTheme.colors.border },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: '800', color: dashboardTheme.colors.text },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, color: dashboardTheme.colors.text, backgroundColor: dashboardTheme.colors.background, fontSize: 16 },
  pushStatus: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: dashboardTheme.colors.surfaceMuted },
  statusText: { color: dashboardTheme.colors.muted, lineHeight: 20 },
  button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: dashboardTheme.colors.primary },
  pressed: { opacity: 0.82 },
  buttonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  error: { color: dashboardTheme.colors.critical, fontWeight: '700' },
  success: { color: dashboardTheme.colors.success, fontWeight: '700' }
});
