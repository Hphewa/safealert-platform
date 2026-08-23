import { useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { REPORT_REJECTION_REASON_MAX_LENGTH } from '@safealert/contracts';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { badgeToneForReportStatus } from '../../shared/utils';
import { officerBottomNavItems } from '../mockData';
import {
  getOfficerReportReviewRecord,
  statusLabelForOfficer,
  validateOfficerRejectionReason,
  type OfficerReportChecklistKey
} from '../reports';

type OfficerReviewAction = 'idle' | 'verified' | 'rejecting' | 'rejected' | 'more-info';

const checklistItems: ReadonlyArray<{
  key: OfficerReportChecklistKey;
  label: string;
  helper: string;
}> = [
  {
    key: 'locationConfirmed',
    label: 'Location confirmed',
    helper: 'Check whether the pin and the described place line up.'
  },
  {
    key: 'timeValid',
    label: 'Time valid',
    helper: 'Make sure the report timing fits the event and weather window.'
  },
  {
    key: 'multipleReports',
    label: 'Multiple reports',
    helper: 'Use related community reports to spot shared evidence.'
  },
  {
    key: 'photoEvidence',
    label: 'Photo evidence',
    helper: 'Confirm whether resident or volunteer photos support the claim.'
  },
  {
    key: 'fieldUpdate',
    label: 'Field update',
    helper: 'Verify whether a volunteer field update exists and is consistent.'
  }
];

export function OfficerReportReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reportId?: string | string[] }>();
  const reportId = Array.isArray(params.reportId) ? params.reportId[0] : params.reportId;
  const report = reportId ? getOfficerReportReviewRecord(reportId) : null;
  const [selectedAction, setSelectedAction] = useState<OfficerReviewAction>('idle');
  const [rejectionReason, setRejectionReason] = useState('');
  const rejectionValidation = validateOfficerRejectionReason(rejectionReason);

  const cancelRejection = () => {
    setRejectionReason('');
    setSelectedAction('idle');
  };

  const confirmRejection = () => {
    if (!rejectionValidation.isValid) {
      return;
    }

    setRejectionReason(rejectionValidation.normalizedReason);
    setSelectedAction('rejected');
  };

  if (!report) {
    return (
      <DashboardScreen bottomNavItems={officerBottomNavItems} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Report Verification</Text>
            <Text style={styles.headerTitle}>Incident Details</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.noticeCard}>
          <View style={styles.noticeIconWrap}>
            <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="document-text-outline" size={22} />
          </View>
          <Text style={styles.noticeTitle}>Report not available</Text>
          <Text style={styles.noticeBody}>
            This report group cannot be loaded right now or the route id is invalid.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Back</Text>
          </Pressable>
        </View>
      </DashboardScreen>
    );
  }

  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Report Verification</Text>
          <Text style={styles.headerTitle}>Incident Details</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard}>
        <View style={styles.badgeRow}>
          <PriorityBadge priority={report.severity} />
          <StatusBadge label={report.statusLabel} tone={badgeToneForReportStatus(report.status)} />
        </View>
        <Text style={styles.heroTitle}>{report.hazardLabel}</Text>
        <Text style={styles.heroSubtitle}>{report.locationLabel}</Text>
        <View style={styles.summaryGrid}>
          <DetailMetric label="Time Reported" value={report.reportedTimeLabel} />
          <DetailMetric label="Latest Update" value={report.latestUpdateLabel} />
          <DetailMetric label="Community Reports" value={report.relatedReportsLabel} />
          <DetailMetric label="Current Status" value={statusLabelForOfficer(report.status)} />
        </View>
      </View>

      <SectionCard title="Resident Evidence">
        <Text style={styles.panelBody}>{report.residentDescription}</Text>
        <View style={styles.inlineDetail}>
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="map-outline" size={16} />
          <Text style={styles.inlineDetailText}>{report.locationDetails}</Text>
        </View>
        <View style={styles.inlineDetail}>
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="list-outline" size={16} />
          <Text style={styles.inlineDetailText}>{report.relatedReportsLabel}</Text>
        </View>
        {report.residentPhotoUrl ? (
          <View style={styles.mediaBlock}>
            <Image
              accessibilityLabel={report.residentPhotoLabel ?? 'Resident photo evidence'}
              source={{ uri: report.residentPhotoUrl }}
              style={styles.mediaPreview}
            />
            {report.residentPhotoLabel ? <Text style={styles.caption}>{report.residentPhotoLabel}</Text> : null}
          </View>
        ) : (
          <Text style={styles.emptyCopy}>No resident photo evidence is attached to this report.</Text>
        )}
      </SectionCard>

      <SectionCard title="Volunteer Field Information">
        {report.volunteerEvidence.length ? (
          <View style={styles.stack}>
            {report.volunteerEvidence.map((evidence) => (
              <View key={evidence.id} style={styles.evidenceCard}>
                <View style={styles.evidenceHeader}>
                  <Text style={styles.evidenceTitle}>Field Update</Text>
                  <Text style={styles.evidenceTime}>{evidence.confirmedAtLabel}</Text>
                </View>
                <Text style={styles.panelBody}>{evidence.observation}</Text>
                {evidence.roadCondition ? (
                  <Text style={styles.metaText}>Road condition: {evidence.roadCondition}</Text>
                ) : null}
                {evidence.waterLevel ? (
                  <Text style={styles.metaText}>Water level: {evidence.waterLevel}</Text>
                ) : null}
                {evidence.photoUrl ? (
                  <View style={styles.mediaBlock}>
                    <Image
                      accessibilityLabel={evidence.photoLabel ?? 'Volunteer photo evidence'}
                      source={{ uri: evidence.photoUrl }}
                      style={styles.mediaPreview}
                    />
                    {evidence.photoLabel ? <Text style={styles.caption}>{evidence.photoLabel}</Text> : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyCopy}>No volunteer field evidence has been recorded for this report yet.</Text>
        )}
      </SectionCard>

      <SectionCard title="Evidence Timeline">
        {report.timeline.length ? (
          <View style={styles.timeline}>
            {report.timeline.map((event) => (
              <View key={event.id} style={styles.timelineRow}>
                <View style={styles.timelineIconWrap}>
                  <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name={event.icon} size={16} />
                </View>
                <View style={styles.timelineBody}>
                  <View style={styles.timelineTitleRow}>
                    <Text style={styles.timelineTitle}>{event.title}</Text>
                    <Text style={styles.timelineTime}>{event.timeLabel}</Text>
                  </View>
                  <Text style={styles.timelineDetail}>{event.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyCopy}>No activity timeline is available for this report yet.</Text>
        )}
      </SectionCard>

      <SectionCard title="Evidence Checklist">
        <Text style={styles.helperText}>
          This is a decision aid only. Checking items does not automatically verify the report.
        </Text>
        <View style={styles.checklist}>
          {checklistItems.map((item) => {
            const isChecked = report.checklist[item.key];

            return (
              <View key={item.key} style={styles.checklistRow}>
                <View style={[styles.checkIconWrap, isChecked ? styles.checkIconPass : styles.checkIconIdle]}>
                  <DashboardGlyph
                    color={isChecked ? dashboardTheme.colors.success : dashboardTheme.colors.muted}
                    name={isChecked ? 'checkmark-done-outline' : 'help-circle-outline'}
                    size={16}
                  />
                </View>
                <View style={styles.checklistBody}>
                  <Text style={styles.checklistTitle}>{item.label}</Text>
                  <Text style={styles.checklistHelper}>{item.helper}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </SectionCard>

      <View style={styles.actionCard}>
        <Text style={styles.sectionTitle}>Officer Actions</Text>
        <Text style={styles.helperText}>
          These actions only change local screen state for now. Verification and rejection APIs will be connected later.
        </Text>
        <View style={styles.actionButtonStack}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedAction('verified')}
            style={({ pressed }) => [
              styles.primaryButton,
              selectedAction === 'verified' && styles.primaryButtonSelected,
              pressed && styles.pressed
            ]}
          >
            <DashboardGlyph color="#ffffff" name="checkmark-done-outline" size={16} />
            <Text style={styles.primaryButtonText}>Mark Verified</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedAction('rejecting')}
            style={({ pressed }) => [
              styles.destructiveButton,
              (selectedAction === 'rejecting' || selectedAction === 'rejected') &&
                styles.destructiveButtonSelected,
              pressed && styles.pressed
            ]}
          >
            <DashboardGlyph color={dashboardTheme.colors.critical} name="alert-circle-outline" size={16} />
            <Text style={styles.destructiveButtonText}>Reject</Text>
          </Pressable>

          {selectedAction === 'rejecting' ? (
            <View style={styles.rejectionPanel}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Reason</Text>
                <Text style={styles.requiredLabel}>Required</Text>
              </View>
              <TextInput
                accessibilityLabel="Rejection reason"
                accessibilityHint="Required before this report can be rejected"
                multiline
                onChangeText={setRejectionReason}
                placeholder="Add reason or notes (required for reject)"
                placeholderTextColor={dashboardTheme.colors.muted}
                style={[styles.reasonInput, !rejectionValidation.isValid && styles.reasonInputError]}
                textAlignVertical="top"
                value={rejectionReason}
              />
              <View style={styles.fieldMetaRow}>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.validationText,
                    rejectionValidation.isValid && styles.validationSuccessText
                  ]}
                >
                  {rejectionValidation.errorMessage ?? 'Reason is ready to submit.'}
                </Text>
                <Text style={styles.characterCount}>
                  {rejectionValidation.normalizedReason.length}/{REPORT_REJECTION_REASON_MAX_LENGTH}
                </Text>
              </View>
              <View style={styles.confirmationActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={cancelRejection}
                  style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !rejectionValidation.isValid }}
                  disabled={!rejectionValidation.isValid}
                  onPress={confirmRejection}
                  style={({ pressed }) => [
                    styles.confirmRejectButton,
                    !rejectionValidation.isValid && styles.confirmRejectButtonDisabled,
                    pressed && rejectionValidation.isValid && styles.pressed
                  ]}
                >
                  <Text
                    style={[
                      styles.confirmRejectButtonText,
                      !rejectionValidation.isValid && styles.confirmRejectButtonTextDisabled
                    ]}
                  >
                    Confirm Rejection
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedAction('more-info')}
            style={({ pressed }) => [
              styles.secondaryButton,
              selectedAction === 'more-info' && styles.secondaryButtonSelected,
              pressed && styles.pressed
            ]}
          >
            <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="help-circle-outline" size={16} />
            <Text style={styles.secondaryButtonText}>Request More Info</Text>
          </Pressable>
        </View>

        <View style={styles.actionStateBanner}>
          <Text style={styles.actionStateLabel}>Selected action</Text>
          <Text style={styles.actionStateValue}>{actionLabelMap[selectedAction]}</Text>
          {selectedAction === 'rejected' ? (
            <Text style={styles.actionStateReason}>Reason: {rejectionReason}</Text>
          ) : null}
        </View>
      </View>
    </DashboardScreen>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const actionLabelMap: Record<OfficerReviewAction, string> = {
  idle: 'Awaiting officer decision',
  verified: 'Mark Verified selected',
  rejecting: 'Rejection reason required',
  rejected: 'Rejection confirmed',
  'more-info': 'Request More Info selected'
};

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 24
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 22,
    backgroundColor: dashboardTheme.colors.surface
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
    gap: 2
  },
  headerSpacer: {
    width: 44
  },
  pressed: {
    opacity: 0.82
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: dashboardTheme.colors.primaryStrong
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  heroCard: {
    gap: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  heroSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '47%',
    gap: 6,
    padding: 14,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  panel: {
    gap: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  panelBody: {
    fontSize: 15,
    lineHeight: 23,
    color: dashboardTheme.colors.text
  },
  inlineDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  inlineDetailText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: dashboardTheme.colors.muted
  },
  mediaBlock: {
    gap: 10
  },
  mediaPreview: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  caption: {
    fontSize: 13,
    color: dashboardTheme.colors.muted
  },
  emptyCopy: {
    fontSize: 14,
    lineHeight: 21,
    color: dashboardTheme.colors.muted
  },
  stack: {
    gap: 12
  },
  evidenceCard: {
    gap: 10,
    padding: 16,
    borderRadius: dashboardTheme.radius.sm,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  evidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  evidenceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  evidenceTime: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  metaText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  timeline: {
    gap: 12
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12
  },
  timelineIconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  timelineBody: {
    flex: 1,
    gap: 4,
    paddingBottom: 2
  },
  timelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  timelineTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  timelineTime: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  timelineDetail: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  helperText: {
    fontSize: 14,
    lineHeight: 21,
    color: dashboardTheme.colors.muted
  },
  checklist: {
    gap: 12
  },
  checklistRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  checkIconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17
  },
  checkIconPass: {
    backgroundColor: dashboardTheme.colors.successSoft
  },
  checkIconIdle: {
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  checklistBody: {
    flex: 1,
    gap: 2
  },
  checklistTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  checklistHelper: {
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.muted
  },
  actionCard: {
    gap: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  actionButtonStack: {
    gap: 12
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  primaryButtonSelected: {
    backgroundColor: dashboardTheme.colors.primaryStrong
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff'
  },
  destructiveButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: dashboardTheme.radius.md,
    borderWidth: 1,
    borderColor: '#f0c6c1',
    backgroundColor: '#fff5f4'
  },
  destructiveButtonSelected: {
    backgroundColor: '#ffe7e4'
  },
  destructiveButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  rejectionPanel: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0c6c1',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: '#fffafa'
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  requiredLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: dashboardTheme.colors.critical
  },
  reasonInput: {
    minHeight: 112,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface,
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.text
  },
  reasonInputError: {
    borderColor: '#e7a29b'
  },
  fieldMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  validationText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.critical
  },
  validationSuccessText: {
    color: dashboardTheme.colors.success
  },
  characterCount: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  confirmationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  cancelButton: {
    minHeight: 46,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  confirmRejectButton: {
    minHeight: 46,
    flexGrow: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.critical
  },
  confirmRejectButtonDisabled: {
    backgroundColor: '#ead9d7'
  },
  confirmRejectButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  confirmRejectButtonTextDisabled: {
    color: '#8f7774'
  },
  secondaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: dashboardTheme.radius.md,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  secondaryButtonSelected: {
    borderColor: dashboardTheme.colors.primary,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  actionStateBanner: {
    gap: 4,
    padding: 14,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  actionStateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  actionStateValue: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  actionStateReason: {
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.muted
  },
  noticeCard: {
    gap: 12,
    alignItems: 'center',
    padding: 22,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  noticeIconWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  noticeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  noticeBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  }
});
