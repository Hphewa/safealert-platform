import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { riskMapFilters, riskMapPresentation, type RiskMapFilter } from '../riskMapPresentation';

export function RiskMapFilters({ selected, onSelect }: { selected: RiskMapFilter; onSelect: (filter: RiskMapFilter) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.filters} accessibilityLabel="Risk severity filters and legend">
    {riskMapFilters.map((filter) => <Pressable key={filter} accessibilityRole="button" accessibilityState={{ selected: selected === filter }}
      onPress={() => onSelect(filter)} style={[styles.chip, selected === filter && styles.selected]}>
      {filter !== 'ALL' ? <View style={[styles.dot, { backgroundColor: riskMapPresentation[filter].color }]} /> : null}
      <Text style={styles.label}>{filter === 'ALL' ? 'All' : riskMapPresentation[filter].label}</Text>
    </Pressable>)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  scroll: { flexGrow: 0 }, filters: { gap: 8, paddingVertical: 8 }, chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: '#cbd5e1', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'white' },
  selected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' }, dot: { width: 10, height: 10, borderRadius: 5 }, label: { fontWeight: '600', color: '#111827' }
});
