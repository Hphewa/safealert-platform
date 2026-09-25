import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { dashboardTheme } from '../../shared/theme';
import { officerBottomNavItems } from '../officerNavigation';
import { AssessmentButton, assessmentStyles } from './RiskAssessmentComponents';

export function WarningPage({ title, reviewing = false, busy = false, onBack, children }: {
  title: string; reviewing?: boolean; busy?: boolean; onBack: () => void; children: ReactNode;
}) {
  return <KeyboardAvoidingView style={warningStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <DashboardScreen bottomNavItems={officerBottomNavItems}>
      <AssessmentButton label="Back to Assessment" secondary disabled={busy} onPress={onBack} />
      <View style={warningStyles.header}>
        <Text style={warningStyles.eyebrow}>EARLY WARNING · DRAFT</Text>
        <Text accessibilityRole="header" style={assessmentStyles.title}>{title}</Text>
        <Text style={assessmentStyles.helper}>Prepare clear safety information from the saved risk assessment.</Text>
      </View>
      <View style={warningStyles.steps}>
        {['Warning details', 'Review warning'].map((label, index) => <View key={label}
          style={[warningStyles.step, Number(reviewing) === index && warningStyles.activeStep]}>
          <Text style={[warningStyles.stepText, Number(reviewing) === index && warningStyles.activeStepText]}>{index + 1}. {label}</Text>
        </View>)}
      </View>
      {children}
    </DashboardScreen>
  </KeyboardAvoidingView>;
}

export const warningStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { gap: 8 },
  eyebrow: { color: dashboardTheme.colors.primaryStrong, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  steps: { flexDirection: 'row', gap: 10 },
  step: { flex: 1, padding: 12, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted,
    borderWidth: 1, borderColor: dashboardTheme.colors.border },
  activeStep: { backgroundColor: dashboardTheme.colors.primarySoft, borderColor: dashboardTheme.colors.primary },
  stepText: { fontSize: 13, fontWeight: '600', color: dashboardTheme.colors.muted },
  activeStepText: { color: dashboardTheme.colors.primaryStrong },
  field: { gap: 8 },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  message: { minHeight: 140, textAlignVertical: 'top' },
  invalidInput: { borderColor: dashboardTheme.colors.critical },
  risk: { padding: 16, gap: 10, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted },
  notice: { padding: 16, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primarySoft },
  success: { padding: 16, gap: 12, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.successSoft },
  successTitle: { color: dashboardTheme.colors.success, fontWeight: '800', fontSize: 21 },
  actions: { gap: 12 },
  link: { color: dashboardTheme.colors.primaryStrong, fontSize: 14, lineHeight: 21 }
});
