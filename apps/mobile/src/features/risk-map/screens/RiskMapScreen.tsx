import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MultiMarkerLocationPreview } from '../../dashboards/shared/maps/MultiMarkerLocationPreview';
import { RiskMapDetailsCard } from '../components/RiskMapDetailsCard';
import { RiskMapFilters } from '../components/RiskMapFilters';
import { useRiskMap } from '../hooks/useRiskMap';
import { filterRiskMapIncidents, riskMapHazard, riskMapPresentation, type RiskMapFilter } from '../riskMapPresentation';

export function RiskMapScreen() {
  const router = useRouter();
  const { data, loading, error, selectedId, refresh, select } = useRiskMap();
  const [filter, setFilter] = useState<RiskMapFilter>('ALL');
  const [fitRequest, setFitRequest] = useState(0);
  const [height, setHeight] = useState(300);
  const visible = useMemo(() => filterRiskMapIncidents(data?.incidents ?? [], filter), [data, filter]);
  const locations = useMemo(() => visible.map((incident) => ({ id: incident.incidentId,
    latitude: incident.location.coordinates[1], longitude: incident.location.coordinates[0],
    color: riskMapPresentation[incident.riskLevel].color,
    label: `${riskMapHazard(incident.hazardType)} · ${riskMapPresentation[incident.riskLevel].label}`
  })), [visible]);
  const selected = visible.find((incident) => incident.incidentId === selectedId);
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}><Text style={styles.action}>‹ Back</Text></Pressable>
      <Text style={styles.title}>Risk Locations</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh risk locations" disabled={loading} onPress={() => void refresh()}><Text style={styles.action}>Refresh</Text></Pressable>
    </View>
    <Text style={styles.caption}>Current assessed risks · {data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()}` : 'Refreshes when you return'}</Text>
    <RiskMapFilters selected={filter} onSelect={(next) => { setFilter(next); select(null); }} />
    {loading ? <View style={styles.state}><ActivityIndicator /><Text>Loading risk locations…</Text></View> : null}
    {error ? <View style={styles.state}><Text style={styles.title}>Risk data unavailable</Text><Text>{error}</Text><Pressable accessibilityRole="button" onPress={() => void refresh()}><Text style={styles.action}>Retry risk data</Text></Pressable></View> : null}
    {data && !visible.length ? <View style={styles.state}>
      <Text style={styles.title}>{data.incidents.length ? 'No matching risk locations' : 'No active assessed risk locations'}</Text>
      <Text>{data.incidents.length ? 'Choose another severity to see current locations.' : 'Locations appear after an active incident receives a current assessment.'}</Text>
      {filter !== 'ALL' ? <Pressable accessibilityRole="button" onPress={() => { setFilter('ALL'); select(null); }}><Text style={styles.action}>Show all</Text></Pressable> : null}
    </View> : null}
    {data && visible.length > 0 ? <>
      <View style={styles.map} onLayout={(event) => setHeight(Math.max(120, event.nativeEvent.layout.height))}>
        <MultiMarkerLocationPreview locations={locations} height={height} onMarkerSelect={select} fitRequest={fitRequest} accessibilityLabel="Current incident risk locations" />
        {Platform.OS !== 'web' ? <Pressable accessibilityRole="button" accessibilityLabel="Fit all visible risk locations" style={styles.fit} onPress={() => setFitRequest((value) => value + 1)}><Text style={styles.action}>Fit locations</Text></Pressable> : null}
      </View>
      {Platform.OS !== 'web' ? <View style={styles.list}>
        <Text style={styles.caption}>{visible.length} {visible.length === 1 ? 'location' : 'locations'} · Select from map or list</Text>
        <FlatList data={locations} keyExtractor={(item) => item.id} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => select(item.id)} style={styles.location}>
          <Text><Text style={{ color: item.color }}>● </Text>{item.label} · {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}</Text>
        </Pressable>} />
      </View> : null}
    </> : null}
    <Modal visible={Boolean(selected && data)} transparent animationType="slide" onRequestClose={() => select(null)}>
      <SafeAreaView style={styles.modal}><ScrollView contentContainerStyle={styles.modalContent}>
        {selected && data ? <RiskMapDetailsCard incident={selected} role={data.role} onClose={() => select(null)} /> : null}
      </ScrollView></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, backgroundColor: '#f8fafc' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontWeight: '800', fontSize: 19, color: '#111827' }, action: { color: '#2563eb', fontWeight: '700', paddingVertical: 12 }, caption: { color: '#64748b', fontSize: 12, paddingVertical: 4 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 }, map: { flex: 1, minHeight: 120 }, fit: { position: 'absolute', right: 12, top: 12, paddingHorizontal: 14, backgroundColor: 'white', borderRadius: 12 },
  list: { maxHeight: 135, paddingTop: 8 }, location: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modal: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' }, modalContent: { flexGrow: 1, justifyContent: 'flex-end', padding: 16 }
});
