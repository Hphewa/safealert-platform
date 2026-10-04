import type { RiskLevel } from '@safealert/contracts';
import { StyleSheet, Text, View } from 'react-native';
import { dashboardTheme } from '../../shared/theme';
import { RiskFactorContributionDetails } from './RiskFactorContributionDetails';
import type { RiskFactorContribution } from '@safealert/contracts';
import { assessmentStyles } from './RiskAssessmentComponents';

const riskColors: Record<RiskLevel, string> = {
  LOW: dashboardTheme.colors.success, MODERATE: dashboardTheme.colors.moderate,
  HIGH: dashboardTheme.colors.high, CRITICAL: dashboardTheme.colors.critical
};

export function RiskRecommendation({ risk, score, factorContributions, calculationVersion }: {
  risk: RiskLevel; score: number; factorContributions?: RiskFactorContribution[]; calculationVersion?: string;
}) {
  return <View style={styles.card}>
    <Text style={assessmentStyles.label}>System Recommendation</Text>
    <Text accessibilityLabel={`Recommended risk: ${risk}`} style={[styles.risk, { color: riskColors[risk] }]}>{risk}</Text>
    <Text style={assessmentStyles.helper}>Risk score</Text>
    <Text style={styles.score}>{score}</Text>
    <Text style={assessmentStyles.body}>Based on the assessment factors provided, the system recommends {risk} risk.</Text>
    <RiskFactorContributionDetails title="Why this recommendation?" contributions={factorContributions}
      score={score} version={calculationVersion} />
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 8, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  risk: { fontSize: 32, lineHeight: 38, fontWeight: '900' },
  score: { color: dashboardTheme.colors.muted, fontSize: 20, fontWeight: '700' }
});
