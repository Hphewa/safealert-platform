import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SafeReport } from '@safealert/contracts';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { resolveMediaReferenceUri } from '../../shared/media/mediaReference';
import { dashboardTheme } from '../../shared/theme';
import { formatAssessmentHazard, formatAssessmentRelativeTime } from '../assessmentQueuePresentation';
import { formatIncidentTime } from '../incidentGrouping';
import { AssessmentDetail, assessmentStyles } from './RiskAssessmentComponents';

export function VerifiedReportAccordion({ report, index }: { report: SafeReport; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const severity = formatAssessmentHazard(report.severity);
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Verified report ${index}, reported severity ${severity}`}
      accessibilityState={{ expanded }} accessibilityHint={expanded ? 'Collapse report evidence' : 'Expand report evidence'}
      onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.65 }]}>
      <View style={styles.heading}>
        <View style={styles.titleRow}>
          <DashboardGlyph name="shield-checkmark-outline" color={dashboardTheme.colors.success} size={20} />
          <Text style={styles.title}>Verified Report</Text>
        </View>
        <Text style={assessmentStyles.helper}>{severity} · {formatAssessmentRelativeTime(report.createdAt).replace(/^Updated /, '')}</Text>
      </View>
      <Text style={styles.expandLabel}>{expanded ? 'Hide' : 'View'}</Text>
    </Pressable>
    <Text numberOfLines={expanded ? undefined : 2} style={assessmentStyles.body}>{report.description}</Text>
    {expanded ? <ExpandedReportEvidence report={report} /> : null}
  </View>;
}

function ExpandedReportEvidence({ report }: { report: SafeReport }) {
  const [imageFailed, setImageFailed] = useState(false);
  const mediaUri = resolveMediaReferenceUri(report.mediaReference);
  // A resident's local file/data URI is not transferable evidence on another officer's device.
  const remoteImage = mediaUri && /^https?:\/\//i.test(mediaUri) ? mediaUri : null;
  return <View style={styles.evidence}>
    <AssessmentDetail label="Reported severity" value={formatAssessmentHazard(report.severity)} />
    <AssessmentDetail label="Verification status" value={report.status} />
    <AssessmentDetail label="Reported at" value={formatIncidentTime(report.createdAt)} />
    {report.verifiedAt ? <AssessmentDetail label="Verified at" value={formatIncidentTime(report.verifiedAt)} /> : null}
    <View style={styles.location}>
      <Text style={assessmentStyles.label}>Report location</Text>
      <HumanReadableLocation location={report.location} style={assessmentStyles.body} />
    </View>
    {remoteImage && !imageFailed ? <Image source={{ uri: remoteImage }} accessibilityLabel="Verified report image evidence"
      style={assessmentStyles.image} resizeMode="cover" onError={() => setImageFailed(true)} /> : null}
    {report.mediaReference && (!remoteImage || imageFailed) ? <Text style={assessmentStyles.helper}>Image evidence is unavailable.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { gap: 10, padding: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: dashboardTheme.colors.text },
  expandLabel: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  evidence: { gap: 12, borderTopWidth: 1, borderTopColor: dashboardTheme.colors.border, paddingTop: 12 },
  location: { gap: 6 }
});
