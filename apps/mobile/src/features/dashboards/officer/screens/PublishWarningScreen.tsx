import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  WARNING_DISTRICTS,
  type SafeWarning,
  type WarningNotificationTarget
} from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getWarning, getWarningAcknowledgements, publishWarning } from '../api/warningApi';
import type { WarningAcknowledgementsResponse, WarningAcknowledgementResponse } from '@safealert/contracts';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import {
  AssessmentButton, AssessmentDetail, AssessmentLoadState, assessmentStyles
} from '../components/RiskAssessmentComponents';
import { WarningPage, warningStyles } from '../components/WarningComponents';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { dashboardTheme } from '../../shared/theme';
import { warningPublishErrorMessage } from '../riskAssessmentForm';

function targetLabel(target: WarningNotificationTarget | undefined, affectedArea: string) {
  if (!target || target.scope === 'AFFECTED_AREA') return `Affected Area — ${affectedArea}`;
  if (target.scope === 'DISTRICT') return `District — ${target.district}`;
  return 'Whole Country';
}

function TargetOption({ label, selected, onPress }: {
  label: string; selected: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress}
    style={[publishStyles.targetOption, selected && publishStyles.targetOptionSelected]}>
    <View style={[publishStyles.radio, selected && publishStyles.radioSelected]} />
    <Text style={publishStyles.targetOptionText}>{label}</Text>
  </Pressable>;
}

function NotificationTargetSelector({ target, onChange, affectedArea }: {
  target: WarningNotificationTarget; onChange: (target: WarningNotificationTarget) => void; affectedArea: string;
}) {
  return <View style={publishStyles.targetCard}>
    <Text style={assessmentStyles.heading}>Notification Target</Text>
    <Text style={assessmentStyles.helper}>Choose who should receive this warning. This does not change the warning's affected area.</Text>
    <TargetOption label="Affected Area" selected={target.scope === 'AFFECTED_AREA'} onPress={() => onChange({ scope: 'AFFECTED_AREA' })} />
    <TargetOption label="District" selected={target.scope === 'DISTRICT'} onPress={() => onChange({ scope: 'DISTRICT', district: 'Colombo' })} />
    {target.scope === 'AFFECTED_AREA' ? <AssessmentDetail label="Selected area" value={affectedArea} /> : null}
    {target.scope === 'WHOLE_COUNTRY' ? <AssessmentDetail label="Country" value="Sri Lanka" /> : null}
    {target.scope === 'DISTRICT' ? <View style={publishStyles.districtPicker}>
      <Text style={assessmentStyles.label}>Select district</Text>
      <View style={publishStyles.districtOptions}>
        {WARNING_DISTRICTS.map((district) => <Pressable key={district} accessibilityRole="radio"
          accessibilityState={{ checked: target.district === district }} onPress={() => onChange({ scope: 'DISTRICT', district })}
          style={[publishStyles.districtOption, target.district === district && publishStyles.districtOptionSelected]}>
          <Text style={[publishStyles.districtText, target.district === district && publishStyles.districtTextSelected]}>{district}</Text>
        </Pressable>)}
      </View>
    </View> : null}
    <TargetOption label="Whole Country" selected={target.scope === 'WHOLE_COUNTRY'} onPress={() => onChange({ scope: 'WHOLE_COUNTRY' })} />
    {target.scope === 'WHOLE_COUNTRY' ? <Text style={warningStyles.notice}>This will notify people across the whole country. Confirm this broad notification before publishing.</Text> : null}
  </View>;
}

export function PublishWarningScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ warningId?: string | string[] }>();
  const warningId = Array.isArray(params.warningId) ? params.warningId[0] : params.warningId;
  const [confirming, setConfirming] = useState(false);
  const [publishedWarning, setPublishedWarning] = useState<SafeWarning | null>(null);
  const [notificationTarget, setNotificationTarget] = useState<WarningNotificationTarget>({ scope: 'AFFECTED_AREA' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<WarningAcknowledgementsResponse | null>(null);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/officer');
  };

  const load = useCallback(async () => {
    if (!accessToken || !warningId) throw new Error('A warning reference is required.');
    return getWarning(warningId, accessToken);
  }, [accessToken, warningId]);
  const resource = useAssessmentResource(load);
  const warning = resource.data?.warning;
  useEffect(() => { if (!accessToken || !warningId || (warning?.status !== 'PUBLISHED' && !publishedWarning)) return; void getWarningAcknowledgements(warningId, accessToken).then(setAcknowledgements).catch(() => setAcknowledgements(null)); }, [accessToken, warningId, warning?.status, publishedWarning]);

  const publish = async () => {
    if (!accessToken || !warningId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await publishWarning(warningId, { notificationTarget }, accessToken);
      setPublishedWarning(result.warning);
    } catch (failure) {
      setError(warningPublishErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const displayedWarning = publishedWarning ?? warning;
  if (!displayedWarning) {
    return <WarningPage title="Publish Warning" onBack={goBack} busy={busy}>
      <AssessmentLoadState loading={resource.loading} error={resource.error} retry={() => void resource.reload()} />
    </WarningPage>;
  }

  return <WarningPage title={publishedWarning ? 'Warning Published!' : 'Publish Warning'} onBack={goBack} busy={busy}>
    {publishedWarning ? <View style={warningStyles.success}>
      <Text style={warningStyles.successTitle}>Warning Published!</Text>
      <AssessmentDetail label="Status" value="PUBLISHED" />
      <AssessmentDetail label="Affected Area" value={publishedWarning.affectedArea} />
      <AssessmentDetail label="Notification Target" value={targetLabel(publishedWarning.notificationTarget, publishedWarning.affectedArea)} />
      <AssessmentDetail label="Published At" value={publishedWarning.publishedAt ? new Date(publishedWarning.publishedAt).toLocaleString() : 'Just now'} />
      <AssessmentButton label="View Warning" onPress={() => router.replace({ pathname: '/officer/warnings/[warningId]', params: { warningId } })} />
      {acknowledgements ? <ResidentResponses data={acknowledgements} /> : null}
    </View> : <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.heading}>Warning Details</Text>
      <AssessmentDetail label="Risk Level" value={displayedWarning.riskLevel} />
      <PriorityBadge priority={displayedWarning.riskLevel} />
      <AssessmentDetail label="Affected Area" value={displayedWarning.affectedArea} />
      <AssessmentDetail label="Required Action" value={displayedWarning.requiredAction} />
      <AssessmentDetail label="Unsafe Roads" value={displayedWarning.unsafeRoads} />
      <AssessmentDetail label="Safe Routes" value={displayedWarning.safeRoutes ?? 'Not provided'} />
      <AssessmentDetail label="Message" value={displayedWarning.message} />
      <AssessmentDetail label="Attachments" value={displayedWarning.attachments?.length ? displayedWarning.attachments.join(', ') : 'None'} />
      <AssessmentDetail label="Current Status" value={displayedWarning.status} />
      <NotificationTargetSelector target={notificationTarget} onChange={setNotificationTarget} affectedArea={displayedWarning.affectedArea} />
      {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
      {displayedWarning.status === 'PUBLISHED' && acknowledgements ? <ResidentResponses data={acknowledgements} /> : null}
      {displayedWarning.status === 'DRAFT' ? !displayedWarning.affectedArea.trim() ? <Text accessibilityRole="alert" style={assessmentStyles.error}>The saved warning has no affected area.</Text> : confirming ? <>
        <Text style={warningStyles.notice}>Review the saved warning details and confirm the selected notification target before publishing.</Text>
        <AssessmentButton label="Cancel" secondary disabled={busy} onPress={() => setConfirming(false)} />
        <AssessmentButton label={busy ? 'Publishing…' : 'Confirm & Publish'} disabled={busy} onPress={() => void publish()} />
      </> : <AssessmentButton label="Review & Publish" disabled={busy} onPress={() => setConfirming(true)} /> : <Text accessibilityRole="alert" style={assessmentStyles.error}>This warning has already been published.</Text>}
    </View>}
  </WarningPage>;
}

function responseLabel(response: WarningAcknowledgementResponse) {
  if (response === 'SAFE') return 'I am Safe';
  if (response === 'EVACUATING') return 'I am Evacuating';
  return 'I Need Assistance';
}

function ResidentResponses({ data }: { data: WarningAcknowledgementsResponse }) {
  return <View style={responseStyles.card}><Text style={assessmentStyles.heading}>Resident Responses</Text><View style={responseStyles.summary}><Text style={responseStyles.total}>Total acknowledged <Text style={responseStyles.count}>{data.summary.total}</Text></Text><Text style={responseStyles.line}>I am Safe <Text style={responseStyles.count}>{data.summary.safe}</Text></Text><Text style={responseStyles.line}>I am Evacuating <Text style={responseStyles.count}>{data.summary.evacuating}</Text></Text><Text style={responseStyles.line}>I Need Assistance <Text style={responseStyles.count}>{data.summary.needAssistance}</Text></Text></View>{data.acknowledgements.map(item => <View key={`${item.warningId}-${item.residentId}`} style={responseStyles.person}><Text style={responseStyles.name}>Resident: {item.resident.name}</Text>{item.resident.district ? <Text style={responseStyles.detail}>District: {item.resident.district}</Text> : null}{item.resident.area ? <Text style={responseStyles.detail}>Area: {item.resident.area}</Text> : null}<Text style={responseStyles.response}>Response: {responseLabel(item.response)}</Text><Text style={responseStyles.detail}>Submitted: {new Date(item.acknowledgedAt).toLocaleString()}</Text></View>)}</View>;
}

const publishStyles = {
  targetCard: { gap: 12, padding: 16, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted } as const,
  targetOption: { minHeight: 48, paddingHorizontal: 12, borderRadius: dashboardTheme.radius.sm, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface } as const,
  targetOptionSelected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft } as const,
  targetOptionText: { color: dashboardTheme.colors.text, fontWeight: '700' as const } as const,
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: dashboardTheme.colors.muted } as const,
  radioSelected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primary } as const,
  districtPicker: { gap: 8 } as const,
  districtOptions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 } as const,
  districtOption: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface } as const,
  districtOptionSelected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primary } as const,
  districtText: { color: dashboardTheme.colors.text, fontSize: 13 } as const,
  districtTextSelected: { color: '#ffffff', fontWeight: '700' as const } as const
};
const responseStyles = { card: { gap: 12, marginTop: 16, padding: 16, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted } as const, summary: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: dashboardTheme.colors.surface } as const, total: { color: dashboardTheme.colors.text, fontWeight: '800' as const }, line: { color: dashboardTheme.colors.muted }, count: { color: dashboardTheme.colors.text, fontWeight: '800' as const, marginLeft: 6 }, person: { gap: 5, padding: 13, borderRadius: 12, backgroundColor: dashboardTheme.colors.surface, borderWidth: 1, borderColor: dashboardTheme.colors.border } as const, name: { color: dashboardTheme.colors.text, fontWeight: '800' as const }, detail: { color: dashboardTheme.colors.muted, fontSize: 13 }, response: { color: dashboardTheme.colors.primaryStrong, fontWeight: '800' as const } };
