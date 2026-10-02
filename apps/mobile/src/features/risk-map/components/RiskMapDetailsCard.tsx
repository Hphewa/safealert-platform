import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { OfficerRiskMapIncident, ResponderRiskMapIncident, RiskMapIncident, UserRole } from '@safealert/contracts';
import { riskMapHazard, riskMapPresentation } from '../riskMapPresentation';
import { HumanReadableLocation } from '../../dashboards/shared/maps/HumanReadableLocation';
import { cardShadow, dashboardTheme } from '../../dashboards/shared/theme';
import { HazardImage } from '../../dashboards/shared/components/HazardImage';

export function RiskMapDetailsCard({ incident, role, onClose }: { incident: RiskMapIncident; role: UserRole; onClose: () => void }) {
  const router = useRouter();
  const risk = riskMapPresentation[incident.riskLevel];
  const operational = role === 'DISASTER_OFFICER' || role === 'EMERGENCY_RESPONDER' ? incident as ResponderRiskMapIncident : null;
  const officer = role === 'DISASTER_OFFICER' ? incident as OfficerRiskMapIncident : null;
  return <View style={styles.card}>
    <View style={styles.heading}><View style={styles.titleRow}><HazardImage hazardType={incident.hazardType} size={48} /><Text style={styles.title}>{riskMapHazard(incident.hazardType)}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close risk details" onPress={onClose}><Text style={styles.action}>Close</Text></Pressable></View>
    <Text style={styles.risk}><Text style={{ color: risk.color }}>● </Text>{risk.label} risk</Text>
    <HumanReadableLocation location={incident.location} />
    <Text>Location coordinates: {incident.location.coordinates[1].toFixed(5)}, {incident.location.coordinates[0].toFixed(5)}</Text>
    <Text>Assessed: {new Date(incident.assessedAt).toLocaleString()}</Text>
    <Text>{incident.hasPublishedWarning ? 'Published warning available' : 'No published warning for this assessment'}</Text>
    {operational ? <Text>Incident: {operational.incidentStatus} · {operational.reportCount} reports</Text> : null}
    {officer ? <>
      <Text>Assessment: {officer.assessmentStatus} · Score: {officer.calculatedScore}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: officer.assessmentId } })}><Text style={styles.action}>View Assessment</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/officer/monitoring/[incidentId]', params: { incidentId: incident.incidentId } })}><Text style={styles.action}>Open Monitoring</Text></Pressable>
      </View>
    </> : null}
    {role === 'EMERGENCY_RESPONDER' || role === 'COMMUNITY_VOLUNTEER' || role === 'RESIDENT' ? (
      <Pressable accessibilityRole="button" accessibilityLabel={role === 'RESIDENT' ? 'View Risk Area Details' : 'View Risk Details'}
        onPress={() => {
          const pathname = role === 'RESIDENT' ? '/resident/risk-locations/[incidentId]'
            : role === 'COMMUNITY_VOLUNTEER' ? '/volunteer/risk-locations/[incidentId]' : '/responder/risk-locations/[incidentId]';
          router.push({ pathname, params: { incidentId: incident.incidentId } });
        }}><Text style={styles.action}>{role === 'RESIDENT' ? 'View Risk Area Details' : 'View Risk Details'}</Text></Pressable>
    ) : null}
    {role === 'RESIDENT' && incident.hasPublishedWarning ? <Pressable accessibilityRole="button" onPress={() => router.push('/resident/warnings')}><Text style={styles.action}>View published warnings</Text></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: dashboardTheme.colors.surface, borderRadius: dashboardTheme.radius.lg, padding: 18, gap: 10, ...cardShadow }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { fontSize: 20, fontWeight: '900', color: dashboardTheme.colors.text }, risk: { fontSize: 16, fontWeight: '800', color: dashboardTheme.colors.text },
  action: { color: dashboardTheme.colors.primaryStrong, fontWeight: '800', paddingVertical: 12 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 }
});
