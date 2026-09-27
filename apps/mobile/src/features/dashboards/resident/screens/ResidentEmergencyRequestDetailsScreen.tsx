import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { presentResidentEmergencyRequestDetails } from '../emergencyRequestPresentation';
import { residentBottomNavItems } from '../mockData';
import { useMyEmergencyRequestDetails } from '../useMyEmergencyRequestDetails';

export function ResidentEmergencyRequestDetailsScreen() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId?: string | string[] }>();
  const { request, error } = useMyEmergencyRequestDetails(requestId);
  const details = request ? presentResidentEmergencyRequestDetails(request) : null;

  const goBack = () => {
    // A direct link may have no previous screen in the Resident stack.
    if (router.canGoBack()) router.back();
    else router.replace('/resident/my-emergency-requests');
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>Emergency Request Details</Text>
      </View>
      {details ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.status}>Status: {details.status}</Text>
          </View>
          {details.sections.map((section) => (
            <View key={section.title} style={styles.panel}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
              {section.fields.map((field) => (
                <View key={field.label} style={styles.field}>
                  <Text style={styles.label}>{field.label}</Text>
                  <Text style={styles.value}>{field.value}</Text>
                </View>
              ))}
            </View>
          ))}
        </>
      ) : (
        <Text accessibilityLiveRegion="polite" style={styles.value}>
          {error ?? 'Loading your emergency request details...'}
        </Text>
      )}
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surface
  },
  title: { flex: 1, fontSize: 24, fontWeight: '800', color: dashboardTheme.colors.text },
  panel: {
    gap: 16, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  status: { fontSize: 20, lineHeight: 28, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  sectionTitle: { fontSize: 18, lineHeight: 26, fontWeight: '800', color: dashboardTheme.colors.text },
  field: { gap: 4 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: dashboardTheme.colors.muted },
  value: { fontSize: 16, lineHeight: 24, color: dashboardTheme.colors.text },
  pressed: { opacity: 0.82 }
});
