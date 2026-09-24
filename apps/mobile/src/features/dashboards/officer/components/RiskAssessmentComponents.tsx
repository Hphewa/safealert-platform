import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { RiskAssessmentFactors, SafeReport } from '@safealert/contracts';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { dashboardTheme } from '../../shared/theme';
import { officerBottomNavItems } from '../mockData';

export const assessmentLabel = (value: string) => value.replace(/_/g, ' ');

export function AssessmentPage({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  return <DashboardScreen bottomNavItems={officerBottomNavItems}>
    <AssessmentButton label="Back to Assessments" secondary onPress={() => router.replace('/officer/assessments')} />
    <Text style={assessmentStyles.title}>{title}</Text>
    {children}
  </DashboardScreen>;
}
export function AssessmentButton({ label, onPress, disabled = false, secondary = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [assessmentStyles.button,
      secondary && assessmentStyles.secondaryButton, (disabled || pressed) && { opacity: 0.55 }]}>
    <Text style={[assessmentStyles.buttonText, secondary && { color: dashboardTheme.colors.primaryStrong }]}>{label}</Text>
  </Pressable>;
}
export function AssessmentLoadState({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) {
  return <View style={assessmentStyles.card}>
    {loading ? <><ActivityIndicator color={dashboardTheme.colors.primary} /><Text style={assessmentStyles.body}>Loading assessment information…</Text></>
      : <><Text accessibilityRole="alert" style={assessmentStyles.error}>{error ?? 'Information is unavailable.'}</Text>
        <AssessmentButton label="Retry" onPress={retry} /></>}
  </View>;
}
export function AssessmentDetail({ label, value }: { label: string; value: string | number }) {
  return <View style={assessmentStyles.detail}><Text style={assessmentStyles.label}>{label}</Text>
    <Text selectable style={assessmentStyles.body}>{value}</Text></View>;
}
export function ReportAssessmentContext({ report }: { report: SafeReport }) {
  // Only remotely accessible evidence is renderable on another user's device.
  const canShowImage = report.mediaReference && /^https?:\/\//i.test(report.mediaReference);
  const [imageFailed, setImageFailed] = useState(false);
  return <View style={assessmentStyles.card}>
    <Text style={assessmentStyles.heading}>Original report</Text>
    <AssessmentDetail label="Hazard Type" value={assessmentLabel(report.hazardType)} />
    <AssessmentDetail label="Reported Severity" value={report.severity} />
    <Text style={assessmentStyles.helper}>Resident information; official risk is assessed separately below.</Text>
    <AssessmentDetail label="Description" value={report.description} />
    <AssessmentDetail label="Location (latitude, longitude)" value={`${report.location.coordinates[1]}, ${report.location.coordinates[0]}`} />
    <AssessmentDetail label="Report Status" value={report.status} />
    <AssessmentDetail label="Report Reference" value={report.id} />
    {canShowImage && !imageFailed ? <Image accessibilityLabel="Resident evidence" source={{ uri: report.mediaReference }}
      onError={() => setImageFailed(true)} style={assessmentStyles.image} resizeMode="cover" /> : null}
    {report.mediaReference && (!canShowImage || imageFailed) ? <Text style={assessmentStyles.helper}>Resident evidence is not available for preview.</Text> : null}
  </View>;
}
// Factor summaries are shared by the decision and saved result views.
export function AssessmentFactorSummary({ factors }: { factors: RiskAssessmentFactors }) {
  return <View style={assessmentStyles.card}>
    <Text style={assessmentStyles.heading}>Assessment factors</Text>
    <AssessmentDetail label="Hazard Severity" value={factors.hazardSeverity} />
    <AssessmentDetail label="People Affected" value={factors.peopleAffected} />
    <AssessmentDetail label="Vulnerable People" value={factors.vulnerablePeople} />
    <AssessmentDetail label="Road Accessibility" value={assessmentLabel(factors.roadAccessibility)} />
    <AssessmentDetail label="Infrastructure Impact" value={factors.infrastructureImpact} />
    <AssessmentDetail label="Water Level Trend" value={assessmentLabel(factors.waterLevelTrend)} />
    <AssessmentDetail label="Weather Condition" value={assessmentLabel(factors.weatherCondition)} />
  </View>;
}
export function AssessmentOptions<T extends string>({ label, options, value, onChange, disabled = false }: {
  label: string; options: readonly T[]; value: T; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <View style={assessmentStyles.detail}>
    <Text style={assessmentStyles.label}>{label}</Text>
    <View style={assessmentStyles.options}>{options.map((option) => <Pressable key={option}
      accessibilityRole="radio" accessibilityLabel={`${label}: ${assessmentLabel(option)}`}
      accessibilityState={{ checked: value === option, disabled }} disabled={disabled} onPress={() => onChange(option)}
      style={[assessmentStyles.option, value === option && assessmentStyles.selectedOption]}>
      <Text style={[assessmentStyles.optionText, value === option && { color: dashboardTheme.colors.primaryStrong }]}>{assessmentLabel(option)}</Text>
    </Pressable>)}</View>
  </View>;
}

// Keep the officer palette and spacing consistent with existing dashboard cards.
export const assessmentStyles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: dashboardTheme.colors.text },
  heading: { fontSize: 19, fontWeight: '700', color: dashboardTheme.colors.text },
  card: { padding: 16, gap: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  detail: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.text },
  body: { fontSize: 16, lineHeight: 23, color: dashboardTheme.colors.text },
  helper: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.muted },
  error: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.critical },
  button: { minHeight: 48, padding: 14, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { backgroundColor: dashboardTheme.colors.primarySoft },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 12, justifyContent: 'center' },
  selectedOption: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft },
  optionText: { fontSize: 13, fontWeight: '600', color: dashboardTheme.colors.text },
  input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 12, fontSize: 16, color: dashboardTheme.colors.text, backgroundColor: dashboardTheme.colors.surface },
  image: { width: '100%', height: 190, borderRadius: 12 }
});
