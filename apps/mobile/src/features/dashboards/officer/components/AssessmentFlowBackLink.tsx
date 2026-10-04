import { Pressable, StyleSheet, Text } from 'react-native';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { dashboardTheme } from '../../shared/theme';

export function AssessmentFlowBackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${label}`} onPress={onPress}
    style={({ pressed }) => [styles.link, pressed && { opacity: 0.65 }]}>
    <DashboardGlyph name="arrow-back" color={dashboardTheme.colors.primaryStrong} size={20} />
    <Text style={styles.label}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 12 },
  label: { fontSize: 15, fontWeight: '700', color: dashboardTheme.colors.primaryStrong }
});
