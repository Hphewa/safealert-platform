import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { getNotificationProfile, updateNotificationProfile } from '../api/notificationApi';
import type { NotificationProfile } from '@safealert/contracts';
import { normalizeNotificationLocation, WARNING_DISTRICTS, NOTIFICATION_COUNTRY, type WarningDistrict } from '@safealert/contracts';
import { ApiClientError } from '../../../services/api/client';
import { useNativePushRegistration } from '../useNativePushRegistration';
import { DashboardHeader } from '../../dashboards/shared/components/DashboardHeader';
import { DashboardScreen } from '../../dashboards/shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../dashboards/shared/theme';
import { residentBottomNavItems } from '../../dashboards/resident/mockData';

const fields = [
  { key: 'area', label: 'Area / Locality', placeholder: 'Your existing locality name' },
  { key: 'phoneNumber', label: 'Phone number', placeholder: 'e.g. 0771234567', keyboardType: 'phone-pad' as const }
] as const;

function canonicalDistrict(value: string | null | undefined): WarningDistrict | undefined {
  const normalized = normalizeNotificationLocation(value);
  if (!normalized) return undefined;
  return WARNING_DISTRICTS.find((district) => normalizeNotificationLocation(district) === normalized);
}

export function NotificationProfileScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const [profile, setProfile] = useState<NotificationProfile>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [districtOpen, setDistrictOpen] = useState(false);
  const pushStatus = useNativePushRegistration(accessToken);
  const selectedDistrict = canonicalDistrict(values.district);
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
          district: canonicalDistrict(result.profile.district) ?? '',
          country: result.profile.country ?? '',
          phoneNumber: result.profile.phoneNumber ?? ''
        });
      })
      .catch(failure => setError(describeError(failure)))
      .finally(() => setLoading(false));
  }, [accessToken]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!accessToken || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const district = canonicalDistrict(values.district);
      const result = await updateNotificationProfile({
        area: values.area?.trim() || null,
        district: district ?? null,
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
      <DashboardHeader title="Resident Profile" description="Manage your contact and location information for safety alerts." />
      <View style={styles.profileCard}>
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name?.[0] ?? 'R').toUpperCase()}</Text></View>
          <View style={styles.identityText}><Text style={styles.name}>{user?.name ?? 'Resident'}</Text><Text style={styles.email}>{user?.email ?? '—'}</Text></View>
        </View>
        <View style={styles.section}>
        <Text style={styles.sectionTitle}>PERSONAL INFORMATION</Text>
        <View style={styles.field}><Text style={styles.label}>Name</Text><TextInput value={user?.name ?? ''} editable={false} style={[styles.input, styles.readOnly]} /></View>
        <View style={styles.field}><Text style={styles.label}>Email</Text><TextInput value={user?.email ?? ''} editable={false} autoCapitalize="none" keyboardType="email-address" style={[styles.input, styles.readOnly]} /></View>
        </View>
        <View style={styles.section}>
        <Text style={styles.sectionTitle}>LOCATION & CONTACT</Text>
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
        <Pressable accessibilityRole="button" accessibilityLabel="Select district" accessibilityState={{ expanded: districtOpen }} disabled={!loaded || saving} onPress={() => setDistrictOpen(true)} style={styles.select}>
          <Text style={selectedDistrict ? styles.selectText : styles.placeholder}>{selectedDistrict ?? 'Select your district'}</Text><Text style={styles.chevron}>⌄</Text>
        </Pressable>
        <View style={styles.country}><Text style={styles.countryLabel}>Country</Text><Text style={styles.countryValue}>{NOTIFICATION_COUNTRY}</Text></View>
        </View>

      </View>
      <View style={styles.profileActions}>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {!loaded && !loading ? <Pressable accessibilityRole="button" onPress={load}><Text>Retry loading profile</Text></Pressable> : null}
        <Pressable disabled={saving || loading || !loaded} onPress={() => void save()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Save notification profile</Text>
        </Pressable>
      </View>
      <View style={styles.warningsCard}>
          <Text style={styles.sectionTitle}>SAFETY ALERTS & WARNINGS</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications & Warnings"
            onPress={() => router.push('/resident/warnings')}
            style={({ pressed }) => [styles.warningsButton, pressed && styles.pressed]}
          >
            <View style={styles.warningsContent}>
              <Text style={styles.warningsTitle}>Notifications & Warnings</Text>
              <Text style={styles.warningsSubtitle}>View active safety warnings.</Text>
            </View>
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        </View>

      <View style={styles.pushStatus}>
        <Text style={styles.sectionTitle}>PUSH NOTIFICATION STATUS</Text>
        <Text style={styles.statusText}>{pushStatus || (profile.pushToken ? 'Registered on your account' : 'Not registered')}</Text>
      </View>

      <Modal transparent visible={districtOpen} animationType="fade" onRequestClose={() => setDistrictOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDistrictOpen(false)}>
          <View style={styles.modalCard}><Text style={styles.modalTitle}>Select district</Text><ScrollView>{WARNING_DISTRICTS.map(district => { const selected = canonicalDistrict(values.district) === district; return <Pressable key={district} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => { setValues(current => ({ ...current, district })); setDistrictOpen(false); }} style={[styles.option, selected && styles.optionSelected]}><Text style={styles.optionText}>{district}</Text></Pressable>; })}</ScrollView></View>
        </Pressable>
      </Modal>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  profileCard: { gap: 20, padding: 18, borderRadius: 22, backgroundColor: dashboardTheme.colors.surface, borderWidth: 1, borderColor: dashboardTheme.colors.border, ...cardShadow },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: dashboardTheme.colors.primarySoft },
  avatarText: { fontSize: 26, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  identityText: { flex: 1, gap: 4 },
  name: { fontSize: 21, fontWeight: '800', color: dashboardTheme.colors.text },
  email: { fontSize: 14, color: dashboardTheme.colors.muted },
  section: { gap: 14 },
  profileActions: { gap: 10 },
  sectionTitle: { fontSize: 12, letterSpacing: 0.8, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: '800', color: dashboardTheme.colors.text },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, color: dashboardTheme.colors.text, backgroundColor: dashboardTheme.colors.background, fontSize: 16 },
  readOnly: { backgroundColor: dashboardTheme.colors.surfaceMuted, color: dashboardTheme.colors.muted },
  select: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { color: dashboardTheme.colors.text, fontSize: 16 },
  placeholder: { color: dashboardTheme.colors.muted, fontSize: 16 },
  chevron: { color: dashboardTheme.colors.primaryStrong, fontSize: 22, fontWeight: '800' },
  country: { gap: 6, paddingVertical: 4 },
  countryLabel: { fontSize: 13, color: dashboardTheme.colors.muted },
  countryValue: { fontSize: 16, fontWeight: '700', color: dashboardTheme.colors.text },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  modalCard: { maxHeight: '80%', borderRadius: 20, padding: 18, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  modalTitle: { fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text, marginBottom: 10 },
  option: { paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10 },
  optionSelected: { backgroundColor: dashboardTheme.colors.primarySoft },
  optionText: { fontSize: 16, color: dashboardTheme.colors.text },
  warningsCard: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: dashboardTheme.colors.primarySoft, borderWidth: 1, borderColor: dashboardTheme.colors.border },
  warningsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  warningsContent: { gap: 4, flex: 1, paddingRight: 10 },
  warningsTitle: { fontSize: 16, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  warningsSubtitle: { fontSize: 13, color: dashboardTheme.colors.text, lineHeight: 18 },
  arrowText: { fontSize: 24, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  pushStatus: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: dashboardTheme.colors.surfaceMuted },
  statusText: { color: dashboardTheme.colors.muted, lineHeight: 20 },
  button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: dashboardTheme.colors.primary },
  pressed: { opacity: 0.82 },
  buttonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  error: { color: dashboardTheme.colors.critical, fontWeight: '700' },
  success: { color: dashboardTheme.colors.success, fontWeight: '700' }
});
