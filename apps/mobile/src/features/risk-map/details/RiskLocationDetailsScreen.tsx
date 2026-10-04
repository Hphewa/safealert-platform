import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { RiskAssessmentFactors } from '@safealert/contracts';
import { goBackSafely } from '@/features/navigation/safeBack';
import { DashboardGlyph } from '../../dashboards/shared/components/DashboardGlyph';
import { HumanReadableLocation } from '../../dashboards/shared/maps/HumanReadableLocation';
import { formatMapCoordinate, geoJsonPointToMapCoordinates } from '../../dashboards/shared/maps/types';
import { resolveMediaReferenceUri } from '../../dashboards/shared/media/mediaReference';
import { cardShadow, dashboardTheme } from '../../dashboards/shared/theme';
import { useRiskLocationDetails } from '../hooks/useRiskLocationDetails';
import { riskMapHazard, riskMapPresentation } from '../riskMapPresentation';

export function RiskLocationDetailsScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useRiskLocationDetails();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [viewerImageFailed, setViewerImageFailed] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const detail = data?.detail;
  const isResident = data?.role === 'RESIDENT';
  const isResponder = data?.role === 'EMERGENCY_RESPONDER';
  const title = isResident ? 'Risk Area Details' : 'Risk Location Details';
  const coordinates = detail ? geoJsonPointToMapCoordinates(detail.location) : null;
  const evidence = detail?.evidence ?? [];
  const imageUri = selectedImage ? resolveMediaReferenceUri(selectedImage) : undefined;
  const timeLabel = detail ? new Date(detail.assessedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBackSafely(router)} style={styles.backButton}>
        <DashboardGlyph name="arrow-back" color={dashboardTheme.colors.text} size={20} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh risk details" onPress={() => void refresh()} style={styles.refreshButton}>
        <Text style={styles.primaryLink}>Refresh</Text>
      </Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {loading ? <StateCard title={`Loading ${title}`} loading /> : null}
      {error ? <StateCard title="Unable to load risk location details" body={error} onRetry={() => void refresh()} /> : null}
      {!loading && !error && detail && data ? <>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={[styles.severity, severityStyle(detail.riskLevel).badge]}>
              <Text style={[styles.severityText, { color: riskMapPresentation[detail.riskLevel].color }]}>{riskMapPresentation[detail.riskLevel].label.toUpperCase()} RISK</Text>
            </View>
            <Text style={styles.assessed}>{timeLabel}</Text>
          </View>
          <Text style={styles.hazard}>{riskMapHazard(detail.hazardType)}</Text>
          {detail.hasPublishedWarning ? <View style={styles.warningTag}><Text style={styles.warningText}>Official warning published</Text></View> : null}
          <HumanReadableLocation location={detail.location} style={styles.locationName} />
          {coordinates ? <Text style={styles.coordinates}>{formatMapCoordinate(coordinates.latitude)}, {formatMapCoordinate(coordinates.longitude)}</Text> : null}
        </View>

        <Section title={isResident ? 'Current Situation' : 'Current Assessment'}>
          <DetailRow label="Risk level" value={riskMapPresentation[detail.riskLevel].label} valueColor={riskMapPresentation[detail.riskLevel].color} />
          <DetailRow label="Hazard" value={riskMapHazard(detail.hazardType)} />
          <DetailRow label="Assessed" value={timeLabel} />
          {data.role === 'DISASTER_OFFICER' || data.role === 'EMERGENCY_RESPONDER' ? <>
            <DetailRow label="Incident status" value="Active" />
            <DetailRow label="Grouped reports" value={String(data.detail.reportCount)} />
          </> : null}
        </Section>

        <Section title={isResponder ? 'Operational Situation' : isResident ? 'Community Safety' : 'Community Situation'}>
          <RiskFactorRows factors={detail.riskFactors} includePopulation={data.role === 'DISASTER_OFFICER' || data.role === 'EMERGENCY_RESPONDER' || data.role === 'COMMUNITY_VOLUNTEER'} />
        </Section>

        <Section title="Evidence">
          {evidence.length ? <>
            <Text style={styles.sectionDescription}>{evidence.length} verified {evidence.length === 1 ? 'image' : 'images'} from incident reports</Text>
            <View style={styles.gallery}>
              {evidence.map((item, index) => {
                const uri = resolveMediaReferenceUri(item.imageUrl);
                const failed = failedImages.has(item.imageUrl) || !uri;
                return <Pressable key={item.imageUrl} accessibilityRole="button" accessibilityLabel={`Open community evidence image ${index + 1}`}
                  disabled={failed} onPress={() => { setViewerImageFailed(false); setSelectedImage(item.imageUrl); }} style={styles.imageTile}>
                  {failed ? <View style={styles.imageFallback}><DashboardGlyph name="camera-outline" color={dashboardTheme.colors.muted} size={24} /><Text style={styles.imageFallbackText}>Image unavailable</Text></View>
                    : <Image accessibilityLabel={`Community evidence image ${index + 1}`} source={{ uri }} resizeMode="cover"
                      onError={() => setFailedImages(current => new Set(current).add(item.imageUrl))} style={styles.image} />}
                </Pressable>;
              })}
            </View>
          </> : <Text style={styles.sectionDescription}>No image evidence is available for this incident.</Text>}
        </Section>

        <Section title="Warning">
          <View style={styles.warningRow}>
            <View style={[styles.warningDot, { backgroundColor: detail.hasPublishedWarning ? dashboardTheme.colors.critical : dashboardTheme.colors.muted }]} />
            <Text style={styles.warningBody}>{detail.hasPublishedWarning ? 'A warning has been published for the current assessment.' : 'No warning has been published for the current assessment.'}</Text>
          </View>
          {isResident && detail.hasPublishedWarning ? <Pressable accessibilityRole="button" accessibilityLabel="View Warnings" onPress={() => router.push('/resident/warnings')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>View Warnings</Text>
          </Pressable> : null}
        </Section>
      </> : null}
    </ScrollView>
    <Modal visible={Boolean(selectedImage && imageUri)} transparent animationType="fade" onRequestClose={() => { setSelectedImage(null); setViewerImageFailed(false); }}>
      <View style={styles.viewer}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close evidence image" onPress={() => { setSelectedImage(null); setViewerImageFailed(false); }} style={styles.closeViewer}><Text style={styles.closeText}>Close</Text></Pressable>
        {selectedImage && imageUri ? viewerImageFailed
          ? <View style={styles.viewerFallback}><Text style={styles.closeText}>Image unavailable</Text></View>
          : <Image accessibilityLabel="Expanded community evidence image" source={{ uri: imageUri }} resizeMode="contain" onError={() => setViewerImageFailed(true)} style={styles.expandedImage} /> : null}
      </View>
    </Modal>
  </SafeAreaView>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={[styles.detailValue, valueColor ? { color: valueColor } : null]}>{value}</Text></View>;
}

function RiskFactorRows({ factors, includePopulation }: { factors: Partial<RiskAssessmentFactors>; includePopulation: boolean }) {
  const entries = useMemo(() => {
    const rows: Array<[string, string]> = [];
    if ('hazardSeverity' in factors && factors.hazardSeverity) rows.push(['Hazard severity', label(factors.hazardSeverity)]);
    if (includePopulation && typeof factors.peopleAffected === 'number') rows.push(['Affected people', String(factors.peopleAffected)]);
    if (includePopulation && typeof factors.vulnerablePeople === 'number') rows.push(['Vulnerable people', String(factors.vulnerablePeople)]);
    if (factors.roadAccessibility) rows.push(['Road access', roadLabel(factors.roadAccessibility)]);
    if (factors.infrastructureImpact) rows.push(['Infrastructure impact', label(factors.infrastructureImpact)]);
    if (factors.waterLevelTrend) rows.push(['Water trend', label(factors.waterLevelTrend)]);
    if (factors.weatherCondition) rows.push(['Weather', weatherLabel(factors.weatherCondition)]);
    return rows;
  }, [factors, includePopulation]);
  return <>{entries.map(([name, value]) => <DetailRow key={name} label={name} value={value} />)}</>;
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/^./, first => first.toUpperCase());
}
function roadLabel(value: string) {
  const labels: Record<string, string> = { ACCESSIBLE: 'Accessible', PARTIALLY_BLOCKED: 'Partially blocked', FULLY_BLOCKED: 'Fully blocked', UNKNOWN: 'Unknown' };
  return labels[value] ?? label(value);
}
function weatherLabel(value: string) {
  const labels: Record<string, string> = { HEAVY_RAIN: 'Heavy rainfall', MODERATE_RAIN: 'Moderate rain', LIGHT_RAIN: 'Light rain', STORM: 'Storm', CLEAR: 'Clear', UNKNOWN: 'Unknown', NOT_APPLICABLE: 'Not applicable' };
  return labels[value] ?? label(value);
}
function severityStyle(level: keyof typeof riskMapPresentation) {
  const background: Record<typeof level, string> = { LOW: '#dcfce7', MODERATE: '#fef9c3', HIGH: '#ffedd5', CRITICAL: '#fee2e2' };
  return { badge: { backgroundColor: background[level] } };
}

function StateCard({ title, body, loading, onRetry }: { title: string; body?: string; loading?: boolean; onRetry?: () => void }) {
  return <View style={styles.stateCard}>{loading ? <ActivityIndicator color={dashboardTheme.colors.primary} /> : null}
    <Text style={styles.stateTitle}>{title}</Text>{body ? <Text style={styles.sectionDescription}>{body}</Text> : null}
    {onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={onRetry}><Text style={styles.primaryLink}>Retry</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dashboardTheme.colors.background }, header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 21, backgroundColor: dashboardTheme.colors.surface },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: dashboardTheme.colors.text }, refreshButton: { minWidth: 58, alignItems: 'center' }, content: { padding: 16, paddingTop: 4, paddingBottom: 28, gap: 16 },
  hero: { padding: 20, gap: 10, backgroundColor: dashboardTheme.colors.surface, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border, ...cardShadow },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, severity: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }, severityText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  assessed: { color: dashboardTheme.colors.muted, fontSize: 13 }, hazard: { fontSize: 26, fontWeight: '900', color: dashboardTheme.colors.text },
  warningTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: dashboardTheme.colors.criticalSoft }, warningText: { color: dashboardTheme.colors.critical, fontWeight: '800', fontSize: 12 },
  locationName: { fontSize: 16, fontWeight: '700', color: dashboardTheme.colors.primaryStrong }, coordinates: { fontSize: 13, color: dashboardTheme.colors.muted },
  section: { gap: 12, padding: 18, backgroundColor: dashboardTheme.colors.surface, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border, ...cardShadow },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text }, sectionDescription: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.muted },
  detailRow: { minHeight: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: dashboardTheme.colors.border },
  detailLabel: { flex: 1, fontSize: 14, color: dashboardTheme.colors.muted }, detailValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.text },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, imageTile: { width: '48%', aspectRatio: 1, overflow: 'hidden', borderRadius: 14, backgroundColor: dashboardTheme.colors.surfaceMuted },
  image: { width: '100%', height: '100%' }, imageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, imageFallbackText: { color: dashboardTheme.colors.muted, fontSize: 12 },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, warningDot: { width: 10, height: 10, borderRadius: 5 }, warningBody: { flex: 1, color: dashboardTheme.colors.text, lineHeight: 21 },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: dashboardTheme.colors.primary, borderRadius: dashboardTheme.radius.sm }, primaryButtonText: { color: 'white', fontWeight: '800' }, primaryLink: { color: dashboardTheme.colors.primary, paddingVertical: 12, fontWeight: '800' },
  stateCard: { padding: 24, gap: 12, alignItems: 'center', backgroundColor: dashboardTheme.colors.surface, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border }, stateTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  viewer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: 'rgba(15,23,42,0.96)' }, closeViewer: { alignSelf: 'flex-end', padding: 14 }, closeText: { color: 'white', fontSize: 16, fontWeight: '700' }, expandedImage: { width: '100%', flex: 1 }, viewerFallback: { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center' }
});
