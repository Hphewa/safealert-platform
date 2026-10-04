import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RiskFactorContribution } from '@safealert/contracts';
import { dashboardTheme } from '../../shared/theme';
import { assessmentStyles } from './RiskAssessmentComponents';

export function RiskFactorContributionDetails({ title, contributions, score, version }: {
  title: string; contributions?: RiskFactorContribution[]; score: number; version?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!contributions?.length) return <View style={styles.card}>
    <Text style={assessmentStyles.heading}>{title}</Text>
    <Text style={assessmentStyles.helper}>Calculation details unavailable</Text>
  </View>;
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)}
      style={styles.toggle}>
      <Text style={assessmentStyles.heading}>{title}</Text>
      <Text style={styles.toggleText}>{expanded ? 'Hide details' : 'Show details'}</Text>
    </Pressable>
    {expanded ? <>
      {contributions.map((entry, index) => <View style={styles.row} key={`${entry.key}-${index}`}>
        <Text style={assessmentStyles.body}>{entry.label}: {entry.selectedValue}</Text>
        <Text style={assessmentStyles.body}>{entry.points} points</Text>
      </View>)}
      <Text style={assessmentStyles.body}>Total: {contributions.reduce((total, entry) => total + entry.points, 0)} points (score {score})</Text>
      {version ? <Text style={assessmentStyles.helper}>Calculation rules: {version}</Text> : null}
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderTopWidth: 1, borderTopColor: dashboardTheme.colors.border, paddingTop: 12, marginTop: 12, gap: 8 },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleText: { color: dashboardTheme.colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }
});
