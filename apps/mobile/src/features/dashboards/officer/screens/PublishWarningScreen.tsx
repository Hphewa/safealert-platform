import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  WARNING_DISTRICTS,
  type ArchiveWarningResponse,
  type CancelWarningResponse,
  type SafeWarning,
  type WarningNotificationTarget
} from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { archiveWarning, cancelWarning, getWarning, getWarningAcknowledgements, publishWarning, updateWarning } from '../api/warningApi';
import type { WarningAcknowledgementsResponse, WarningAcknowledgementResponse } from '@safealert/contracts';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { useWarningDelivery } from '../hooks/useWarningDelivery';
import {
  AssessmentButton, AssessmentDetail, AssessmentLoadState, assessmentStyles
} from '../components/RiskAssessmentComponents';
import { WarningPage, warningStyles } from '../components/WarningComponents';
import { WarningDeliveryPanel } from '../components/WarningDeliveryPanel';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { warningLifecycleErrorMessage, warningPublishErrorMessage } from '../riskAssessmentForm';
import { WarningInformationForm } from '../components/WarningInformationForm';
import { initialWarningForm, validateWarningForm, type WarningForm, type WarningFormErrors } from '../warningForm';

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

// LDFEW-115: confirmation dialog for irreversible lifecycle transitions.
function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm, busy }: {
  title: string; message: string; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <View style={lifecycleStyles.dialog}>
      <Text style={lifecycleStyles.dialogTitle}>{title}</Text>
      <Text style={lifecycleStyles.dialogMessage}>{message}</Text>
      <View style={lifecycleStyles.dialogActions}>
        <AssessmentButton label="Cancel" secondary disabled={busy} onPress={onCancel} />
        <AssessmentButton label={busy ? 'Please wait…' : confirmLabel} disabled={busy} onPress={onConfirm} />
      </View>
    </View>
  );
}

export function PublishWarningScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ warningId?: string | string[]; mode?: string | string[]; returnTo?: string | string[] }>();
  const warningId = Array.isArray(params.warningId) ? params.warningId[0] : params.warningId;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const [confirming, setConfirming] = useState(false);
  const [publishedResult, setPublishedWarning] = useState<SafeWarning | null>(null);
  const publishedWarning = publishedResult && publishedResult.id === warningId ? publishedResult : null;
  const [notificationTarget, setNotificationTarget] = useState<WarningNotificationTarget>({ scope: 'AFFECTED_AREA' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'archive' | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleSuccess, setLifecycleSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<WarningForm>(initialWarningForm);
  const [editErrors, setEditErrors] = useState<WarningFormErrors>({});
  const [acknowledgements, setAcknowledgements] = useState<WarningAcknowledgementsResponse | null>(null);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    const fallback = returnTo?.startsWith('/officer/') || returnTo === '/officer'
      ? returnTo
      : '/officer/warnings';
    router.replace(fallback);
  };

  const load = useCallback(async () => {
    if (!accessToken || !warningId) throw new Error('A warning reference is required.');
    return getWarning(warningId, accessToken);
  }, [accessToken, warningId]);
  const resource = useAssessmentResource(load);
  const loadedWarning = resource.data?.warning;
  const warning = loadedWarning && loadedWarning.id === warningId ? loadedWarning : undefined;
  const delivery = useWarningDelivery(warningId, accessToken,
    (publishedWarning ?? warning)?.status === 'PUBLISHED');
  useEffect(() => { if (!accessToken || !warningId || (warning?.status !== 'PUBLISHED' && !publishedWarning)) return; void getWarningAcknowledgements(warningId, accessToken).then(setAcknowledgements).catch(() => setAcknowledgements(null)); }, [accessToken, warningId, warning?.status, publishedWarning]);

  const publish = async () => {
    if (!accessToken || !warningId || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await publishWarning(warningId, { notificationTarget }, accessToken);
      setPublishedWarning(result.warning);
    } catch (failure) {
      setActionError(warningPublishErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  // LDFEW-115: open the edit form pre-populated with the persisted field values.
  const openEdit = (w: SafeWarning) => {
    setEditForm({
      affectedArea: w.affectedArea,
      requiredAction: w.requiredAction,
      unsafeRoads: w.unsafeRoads,
      safeRoutes: w.safeRoutes ?? '',
      message: w.message,
      attachments: (w.attachments ?? []).join('\n'),
    });
    setEditErrors({});
    setEditing(true);
    setLifecycleSuccess(null);
    setActionError(null);
  };

  // LDFEW-115: save content edits via PATCH. The service discards assessmentId; it is
  // not sent to keep the request clean and avoid confusion in the update schema.
  const saveEdit = async () => {
    if (!accessToken || !warningId || lifecycleBusy) return;
    const errors = validateWarningForm(editForm);
    if (Object.keys(errors).length > 0) { setEditErrors(errors); return; }
    setLifecycleBusy(true);
    setActionError(null);
    try {
      const trimmed = {
        affectedArea: editForm.affectedArea.trim(),
        requiredAction: editForm.requiredAction.trim(),
        unsafeRoads: editForm.unsafeRoads.trim(),
        message: editForm.message.trim(),
        ...(editForm.safeRoutes.trim() ? { safeRoutes: editForm.safeRoutes.trim() } : {}),
        attachments: editForm.attachments.split(/\r?\n/).map((r) => r.trim()).filter(Boolean),
      };
      await updateWarning(warningId, trimmed, accessToken);
      setEditing(false);
      setLifecycleSuccess('Warning updated successfully.');
      void resource.reload();
    } catch (failure) {
      setActionError(warningLifecycleErrorMessage(failure));
    } finally {
      setLifecycleBusy(false);
    }
  };

  // LDFEW-115: perform the confirmed cancel or archive transition.
  const confirmLifecycleAction = async (action: 'cancel' | 'archive') => {
    if (!accessToken || !warningId || lifecycleBusy) return;
    setLifecycleBusy(true);
    setActionError(null);
    try {
      let result: CancelWarningResponse | ArchiveWarningResponse;
      if (action === 'cancel') {
        result = await cancelWarning(warningId, accessToken);
        setLifecycleSuccess('Warning cancelled successfully.');
      } else {
        result = await archiveWarning(warningId, accessToken);
        setLifecycleSuccess('Warning archived successfully.');
      }
      setConfirmAction(null);
      void resource.reload();
      return result;
    } catch (failure) {
      setActionError(warningLifecycleErrorMessage(failure));
    } finally {
      setLifecycleBusy(false);
    }
  };

  const displayedWarning = publishedWarning ?? warning;
  const isPublished = displayedWarning?.status === 'PUBLISHED';
  if (!displayedWarning) {
    return <WarningPage title="Publish Warning" onBack={goBack} busy={busy}>
      <AssessmentLoadState loading={resource.loading} error={resource.error} retry={() => void resource.reload()} />
    </WarningPage>;
  }

  // LDFEW-115: determine which lifecycle actions are permitted based on backend-sourced status.
  // The displayed warning may be the just-published transient; always prefer the freshly loaded status.
  const currentStatus = resource.data?.warning?.status ?? displayedWarning.status;
  const canEdit = currentStatus === 'DRAFT' || currentStatus === 'PUBLISHED';
  const canCancel = currentStatus === 'DRAFT' || currentStatus === 'PUBLISHED';
  const canArchive = currentStatus !== 'ARCHIVED';

  return <WarningPage title={isPublished ? 'Published Warning' : mode === 'view' ? 'View Warning' : mode === 'draft' ? 'View/Edit Draft' : 'Publish Warning'} published={isPublished} onBack={goBack} busy={busy}>
    {publishedWarning ? <View style={styles.publishedPanel}>
      <View style={styles.publishedHeader}><View style={styles.headerCopy}><Text style={styles.eyebrow}>EARLY WARNING · PUBLISHED</Text><Text style={styles.publishedTitle}>Warning Published</Text></View><PriorityBadge priority={publishedWarning.riskLevel} /></View>
      <View style={styles.statusPill}><Text style={styles.statusDot}>●</Text><Text style={styles.statusText}>PUBLISHED</Text></View>
      <AssessmentDetail label="Status" value="PUBLISHED" />
      <AssessmentDetail label="Affected Area" value={publishedWarning.affectedArea} />
      <AssessmentDetail label="Notification Target" value={targetLabel(publishedWarning.notificationTarget, publishedWarning.affectedArea)} />
      <AssessmentDetail label="Published At" value={publishedWarning.publishedAt ? new Date(publishedWarning.publishedAt).toLocaleString() : 'Just now'} />
      <AssessmentButton label="View Warning" onPress={() => router.replace({ pathname: '/officer/warnings/[warningId]', params: { warningId, mode: 'view', ...(returnTo ? { returnTo } : {}) } })} />
      <WarningDeliveryPanel delivery={delivery.data} loading={delivery.loading} error={delivery.error} onRetry={delivery.reload} />
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
      {isPublished ? <View style={styles.infoCard}><Text style={styles.cardTitle}>Notification Target</Text><Text style={styles.cardSubtitle}>Who received this warning</Text><AssessmentDetail label="Target" value={targetLabel(displayedWarning.notificationTarget, displayedWarning.affectedArea)} /></View> : <NotificationTargetSelector target={notificationTarget} onChange={setNotificationTarget} affectedArea={displayedWarning.affectedArea} />}
      {actionError ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{actionError}</Text> : null}
      {isPublished ? <WarningDeliveryPanel delivery={delivery.data} loading={delivery.loading} error={delivery.error} onRetry={delivery.reload} /> : null}
      {isPublished && acknowledgements ? <ResidentResponses data={acknowledgements} /> : null}
      {displayedWarning.status === 'DRAFT' ? !displayedWarning.affectedArea.trim() ? <Text accessibilityRole="alert" style={assessmentStyles.error}>The saved warning has no affected area.</Text> : confirming ? <>
        <Text style={warningStyles.notice}>Review the saved warning details and confirm the selected notification target before publishing.</Text>
        <AssessmentButton label="Cancel" secondary disabled={busy} onPress={() => setConfirming(false)} />
        <AssessmentButton label={busy ? 'Publishing…' : 'Confirm & Publish'} disabled={busy} onPress={() => void publish()} />
      </> : <AssessmentButton label="Review & Publish" disabled={busy} onPress={() => setConfirming(true)} /> : <Text accessibilityRole="alert" style={assessmentStyles.error}>This warning has already been published.</Text>}

      {/* LDFEW-115: lifecycle success message */}
      {lifecycleSuccess ? (
        <Text style={lifecycleStyles.success}>{lifecycleSuccess}</Text>
      ) : null}

      {/* LDFEW-115: inline edit form — shown only while editing is active */}
      {editing && canEdit ? (
        <View style={lifecycleStyles.editSection}>
          <Text style={lifecycleStyles.sectionTitle}>Edit Warning</Text>
          <WarningInformationForm
            form={editForm}
            affectedArea={displayedWarning.affectedArea}
            riskLevel={displayedWarning.riskLevel}
            errors={editErrors}
            onChange={(field, value) => setEditForm((prev) => ({ ...prev, [field]: value }))}
          />
          {actionError ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{actionError}</Text> : null}
          <View style={lifecycleStyles.editActions}>
            <AssessmentButton
              label="Discard Changes"
              secondary
              disabled={lifecycleBusy}
              onPress={() => { setEditing(false); setEditErrors({}); setActionError(null); }}
            />
            <AssessmentButton
              label={lifecycleBusy ? 'Saving…' : 'Save Changes'}
              disabled={lifecycleBusy}
              onPress={() => void saveEdit()}
            />
          </View>
        </View>
      ) : null}

      {/* LDFEW-115: cancel confirmation dialog */}
      {confirmAction === 'cancel' ? (
        <ConfirmDialog
          title="Cancel this warning?"
          message="This warning will no longer be treated as an active published warning."
          confirmLabel="Confirm Cancellation"
          busy={lifecycleBusy}
          onCancel={() => { setConfirmAction(null); setActionError(null); }}
          onConfirm={() => void confirmLifecycleAction('cancel')}
        />
      ) : null}

      {/* LDFEW-115: archive confirmation dialog */}
      {confirmAction === 'archive' ? (
        <ConfirmDialog
          title="Archive this warning?"
          message="Archived warnings will no longer appear as active warnings."
          confirmLabel="Confirm Archive"
          busy={lifecycleBusy}
          onCancel={() => { setConfirmAction(null); setActionError(null); }}
          onConfirm={() => void confirmLifecycleAction('archive')}
        />
      ) : null}

      {/* LDFEW-115: lifecycle action buttons — hidden while a dialog or edit form is open */}
      {!editing && !confirmAction ? (
        <View style={lifecycleStyles.lifecycleActions}>
          {canEdit ? (
            <AssessmentButton
              label="Edit Warning"
              secondary
              disabled={lifecycleBusy || busy}
              onPress={() => openEdit(displayedWarning)}
            />
          ) : null}
          {canCancel ? (
            <AssessmentButton
              label="Cancel Warning"
              secondary
              disabled={lifecycleBusy || busy}
              onPress={() => { setConfirmAction('cancel'); setActionError(null); setLifecycleSuccess(null); }}
            />
          ) : null}
          {canArchive ? (
            <AssessmentButton
              label="Archive Warning"
              secondary
              disabled={lifecycleBusy || busy}
              onPress={() => { setConfirmAction('archive'); setActionError(null); setLifecycleSuccess(null); }}
            />
          ) : null}
        </View>
      ) : null}
    </View>}
  </WarningPage>;
}

function responseLabel(response: WarningAcknowledgementResponse) {
  if (response === 'SAFE') return 'I am Safe';
  if (response === 'EVACUATING') return 'I am Evacuating';
  return 'I Need Assistance';
}

function ResidentResponses({ data }: { data: WarningAcknowledgementsResponse }) {
  return <View style={responseStyles.card}><View><Text style={responseStyles.title}>Resident Responses</Text><Text style={responseStyles.subtitle}>Confirmed responses from residents who acknowledged this warning.</Text></View><View style={responseStyles.summary}>{[['Total', data.summary.total, 'total'], ['I am Safe', data.summary.safe, 'safe'], ['Evacuating', data.summary.evacuating, 'evacuating'], ['Need Assistance', data.summary.needAssistance, 'assistance']].map(([label, count, tone]) => <View key={String(label)} style={[responseStyles.stat, responseStyles[tone as 'total' | 'safe' | 'evacuating' | 'assistance']]}><Text style={responseStyles.statLabel}>{label}</Text><Text style={responseStyles.statCount}>{count}</Text></View>)}</View>{data.acknowledgements.length ? data.acknowledgements.map(item => <View key={`${item.warningId}-${item.residentId}`} style={responseStyles.person}><View style={responseStyles.personHeader}><Text style={responseStyles.name}>{item.resident.name}</Text><View style={[responseStyles.responseBadge, responseStyles[item.response.toLowerCase() as 'safeBadge' | 'evacuatingBadge' | 'need_assistanceBadge']]}><Text style={responseStyles.responseBadgeText}>{responseLabel(item.response)}</Text></View></View>{item.resident.district ? <Text style={responseStyles.detail}>District · {item.resident.district}</Text> : null}{item.resident.area ? <Text style={responseStyles.detail}>Area · {item.resident.area}</Text> : null}<Text style={responseStyles.detail}>Submitted · {new Date(item.acknowledgedAt).toLocaleString()}</Text></View>) : <View style={responseStyles.empty}><Text style={responseStyles.emptyTitle}>No resident responses yet</Text><Text style={responseStyles.emptyText}>Residents who acknowledge this warning will appear here.</Text></View>}</View>;
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
// LDFEW-115: styles for lifecycle action panels and confirmation dialogs.
const lifecycleStyles = StyleSheet.create({
  lifecycleActions: { gap: 10, marginTop: 8 },
  editSection: { gap: 14, marginTop: 8 },
  sectionTitle: { color: dashboardTheme.colors.text, fontSize: 18, fontWeight: '800' },
  editActions: { gap: 10 },
  dialog: { gap: 12, padding: 18, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface },
  dialogTitle: { color: dashboardTheme.colors.text, fontSize: 18, fontWeight: '800' },
  dialogMessage: { color: dashboardTheme.colors.muted, fontSize: 14, lineHeight: 22 },
  dialogActions: { gap: 10 },
  success: { color: dashboardTheme.colors.success, fontSize: 14, fontWeight: '700', paddingVertical: 8 },
});
const styles = StyleSheet.create({ publishedPanel: { gap: 16, padding: 20, borderRadius: 18, backgroundColor: dashboardTheme.colors.surface, borderWidth: 1, borderColor: dashboardTheme.colors.border, ...cardShadow }, publishedHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, headerCopy: { flex: 1, gap: 6 }, eyebrow: { color: dashboardTheme.colors.primaryStrong, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, publishedTitle: { color: dashboardTheme.colors.text, fontSize: 25, fontWeight: '900' }, statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: dashboardTheme.colors.successSoft }, statusDot: { color: dashboardTheme.colors.success, fontSize: 12 }, statusText: { color: '#15803d', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }, infoCard: { gap: 8, padding: 20, borderRadius: 16, backgroundColor: dashboardTheme.colors.primarySoft, borderWidth: 1, borderColor: '#bfdbfe', ...cardShadow }, cardTitle: { color: dashboardTheme.colors.text, fontSize: 19, fontWeight: '900' }, cardSubtitle: { color: dashboardTheme.colors.muted, fontSize: 13, lineHeight: 19 }, neutralState: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: dashboardTheme.colors.surface }, neutralIcon: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, color: dashboardTheme.colors.primaryStrong, backgroundColor: dashboardTheme.colors.primarySoft, fontWeight: '900' }, neutralText: { flex: 1, color: dashboardTheme.colors.muted, fontSize: 13, lineHeight: 18 } });
const responseStyles = { card: { gap: 14, marginTop: 16, padding: 20, borderRadius: 16, backgroundColor: dashboardTheme.colors.surface, borderWidth: 1, borderColor: dashboardTheme.colors.border, ...cardShadow } as const, title: { color: dashboardTheme.colors.text, fontSize: 20, fontWeight: '900' as const }, subtitle: { color: dashboardTheme.colors.muted, fontSize: 13, lineHeight: 19 }, summary: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 9 }, stat: { flexGrow: 1, flexBasis: '46%' as const, minWidth: 120, gap: 6, padding: 13, borderRadius: 12, borderWidth: 1 }, total: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }, safe: { backgroundColor: dashboardTheme.colors.successSoft, borderColor: '#bbf7d0' }, evacuating: { backgroundColor: dashboardTheme.colors.highSoft, borderColor: '#fed7aa' }, assistance: { backgroundColor: dashboardTheme.colors.criticalSoft, borderColor: '#fecaca' }, statLabel: { color: dashboardTheme.colors.muted, fontSize: 12, fontWeight: '800' as const }, statCount: { color: dashboardTheme.colors.text, fontSize: 24, fontWeight: '900' as const }, person: { gap: 7, padding: 15, borderRadius: 12, backgroundColor: dashboardTheme.colors.surfaceMuted, borderWidth: 1, borderColor: dashboardTheme.colors.border }, personHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 }, name: { flex: 1, color: dashboardTheme.colors.text, fontSize: 16, fontWeight: '900' as const }, detail: { color: dashboardTheme.colors.muted, fontSize: 13 }, responseBadge: { maxWidth: '62%' as const, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 }, safeBadge: { backgroundColor: dashboardTheme.colors.successSoft }, evacuatingBadge: { backgroundColor: dashboardTheme.colors.highSoft }, need_assistanceBadge: { backgroundColor: dashboardTheme.colors.criticalSoft }, responseBadgeText: { color: dashboardTheme.colors.text, fontSize: 12, fontWeight: '800' as const }, empty: { alignItems: 'center' as const, gap: 5, paddingVertical: 14 }, emptyTitle: { color: dashboardTheme.colors.text, fontWeight: '800' as const }, emptyText: { color: dashboardTheme.colors.muted, fontSize: 13, textAlign: 'center' as const } };
