import { StyleSheet, Text, View } from 'react-native';
import { dashboardTheme } from '../../shared/theme';

const stepLabels = ['Situation', 'Impact & Access', 'Environment'] as const;

export function AssessmentProgress({ step }: { step: 1 | 2 | 3 }) {
  return <View accessibilityLabel={`Step ${step} of 3: ${stepLabels[step - 1]}`} style={styles.container}>
    <Text style={styles.count}>Step {step} of 3</Text>
    <View style={styles.track}>
      {stepLabels.map((label, index) => <View key={label} style={styles.step}>
        <View accessibilityState={{ selected: index + 1 === step }} style={[styles.dot, index + 1 <= step && styles.activeDot]} />
        <Text style={[styles.label, index + 1 === step && styles.activeLabel]}>{label}</Text>
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: dashboardTheme.colors.surface, borderWidth: 1, borderColor: dashboardTheme.colors.border },
  count: { color: dashboardTheme.colors.muted, fontSize: 13, fontWeight: '700' },
  track: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  step: { flex: 1, gap: 7, alignItems: 'flex-start' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface },
  activeDot: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primary },
  label: { color: dashboardTheme.colors.muted, fontSize: 12, lineHeight: 16 },
  activeLabel: { color: dashboardTheme.colors.text, fontWeight: '700' }
});
