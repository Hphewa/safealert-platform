import { StyleSheet, Text, View } from 'react-native';

import { dashboardTheme } from '../theme';

const items = [
  ['LOW', 'Low risk', dashboardTheme.colors.low],
  ['MODERATE', 'Medium risk', dashboardTheme.colors.moderate],
  ['HIGH', 'High risk', dashboardTheme.colors.high],
  ['CRITICAL', 'Critical risk', dashboardTheme.colors.critical]
] as const;

export function HazardLegend() {
  return <View style={styles.card}><Text style={styles.title}>RISK LEVELS</Text><View style={styles.row}>{items.map(([key, label, color]) => <View key={key} style={styles.item}><View style={[styles.marker, { backgroundColor: color }]}><Text style={styles.markerText}>{key === 'CRITICAL' ? '!' : key === 'HIGH' ? '!' : '·'}</Text></View><Text style={styles.label}>{label}</Text></View>)}</View></View>;
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  title: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: dashboardTheme.colors.muted },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  item: { flex: 1, alignItems: 'center', gap: 6 },
  marker: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  markerText: { fontSize: 16, fontWeight: '900', color: '#ffffff' },
  label: { fontSize: 10, fontWeight: '700', textAlign: 'center', color: dashboardTheme.colors.text }
});
