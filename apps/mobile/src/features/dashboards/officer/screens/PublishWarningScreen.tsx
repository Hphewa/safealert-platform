import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  WARNING_DISTRICTS,
  type ArchiveWarningResponse,
  type CancelWarningResponse,
  type SafeWarning,
  type WarningDistrict,
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
import { WarningPage } from '../components/WarningComponents';
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

function lifecycleDate(warning: SafeWarning) {
  if (warning.status === 'PUBLISHED') return { label: 'Published', value: warning.publishedAt };
  if (warning.status === 'CANCELLED') return { label: 'Cancelled', value: warning.cancelledAt };
  if (warning.status === 'ARCHIVED') return { label: 'Archived', value: warning.archivedAt };
  return { label: 'Created', value: warning.createdAt };
}

function formatWarningDate(value: string | undefined) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

type NotificationTargetSelection =
  | Exclude<WarningNotificationTarget, { scope: 'DISTRICT' }>
  | { scope: 'DISTRICT'; district?: WarningDistrict };

function isPublishableNotificationTarget(target: NotificationTargetSelection): target is WarningNotificationTarget {
  return target.scope !== 'DISTRICT' || Boolean(target.district);
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

function DistrictSelect({ selectedDistrict, onChange }: {
  selectedDistrict?: WarningDistrict;
  onChange: (district: WarningDistrict) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filteredDistricts = WARNING_DISTRICTS.filter((district) =>
    district.toLowerCase().includes(query.trim().toLowerCase())
  );

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return <View style={publishStyles.districtSelector}>
    <Text style={assessmentStyles.label}>Select district</Text>
    <Pressable
      accessibilityLabel={`Select district${selectedDistrict ? `, ${selectedDistrict} selected` : ''}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen(true)}
      style={({ pressed }) => [publishStyles.districtSelectButton, pressed && publishStyles.pressed]}
    >
      <Text style={publishStyles.districtPin}>⌖</Text>
      <Text numberOfLines={1} style={[publishStyles.districtSelectText, !selectedDistrict && publishStyles.districtPlaceholder]}>
        {selectedDistrict ?? 'Select district'}
      </Text>
      <Text aria-hidden style={publishStyles.districtChevron}>⌄</Text>
    </Pressable>
    {selectedDistrict ? <View style={publishStyles.scopeConfirmation}>
      <Text style={publishStyles.scopeConfirmationTitle}>✓ Notification scope</Text>
      <Text style={publishStyles.scopeConfirmationValue}>{selectedDistrict} District</Text>
    </View> : null}

    <Modal
      animationType="fade"
      onRequestClose={close}
      presentationStyle="overFullScreen"
      transparent
      visible={open}
    >
      <View style={publishStyles.modalOverlay}>
        <Pressable
          accessibilityLabel="Close district selector"
          accessibilityRole="button"
          onPress={close}
          style={publishStyles.modalBackdrop}
        />
        <View accessibilityViewIsModal style={publishStyles.modalCard}>
          <View style={publishStyles.modalHeader}>
            <View style={publishStyles.modalHeaderCopy}>
              <Text accessibilityRole="header" style={publishStyles.modalTitle}>Select district</Text>
              <Text style={publishStyles.modalSubtitle}>Choose one supported district.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close district selector"
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => [publishStyles.modalClose, pressed && publishStyles.pressed]}
            >
              <Text style={publishStyles.modalCloseText}>×</Text>
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel="Search district"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search district..."
            placeholderTextColor={dashboardTheme.colors.muted}
            returnKeyType="search"
            style={publishStyles.districtSearch}
            value={query}
          />
          <ScrollView
            accessibilityLabel="District options"
            keyboardShouldPersistTaps="handled"
            style={publishStyles.districtList}
          >
            {filteredDistricts.length ? filteredDistricts.map((district) => {
              const selected = selectedDistrict === district;
              return <Pressable
                accessibilityLabel={`${district}${selected ? ', selected' : ''}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={district}
                onPress={() => { onChange(district); close(); }}
                style={({ pressed }) => [publishStyles.districtOption, selected && publishStyles.districtOptionSelected, pressed && publishStyles.pressed]}
              >
                <Text style={[publishStyles.districtOptionText, selected && publishStyles.districtOptionTextSelected]}>{district}</Text>
                {selected ? <Text accessibilityLabel="Selected" style={publishStyles.districtCheck}>✓</Text> : null}
              </Pressable>;
            }) : <Text style={publishStyles.noDistricts}>No districts match your search.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

function NotificationTargetSelector({ target, onChange, affectedArea }: {
  target: NotificationTargetSelection; onChange: (target: NotificationTargetSelection) => void; affectedArea: string;
}) {
  return <View style={publishStyles.targetCard}>
    <Text style={assessmentStyles.heading}>Notification Target</Text>
    <Text style={assessmentStyles.helper}>Choose who should receive this warning. This does not change the warning's affected area.</Text>
    <TargetOption label="Affected Area" selected={target.scope === 'AFFECTED_AREA'} onPress={() => onChange({ scope: 'AFFECTED_AREA' })} />
    <TargetOption
      label="District"
      selected={target.scope === 'DISTRICT'}
      onPress={() => onChange(target.scope === 'DISTRICT' ? target : { scope: 'DISTRICT' })}
    />
    {target.scope === 'AFFECTED_AREA' ? <AssessmentDetail label="Selected area" value={affectedArea} /> : null}
    {target.scope === 'WHOLE_COUNTRY' ? <AssessmentDetail label="Country" value="Sri Lanka" /> : null}
    {target.scope === 'DISTRICT' ? <DistrictSelect selectedDistrict={target.district} onChange={(district) => onChange({ scope: 'DISTRICT', district })} /> : null}
    <TargetOption label="Whole Country" selected={target.scope === 'WHOLE_COUNTRY'} onPress={() => onChange({ scope: 'WHOLE_COUNTRY' })} />
    {target.scope === 'WHOLE_COUNTRY' ? <Text style={publishStyles.countryNotice}>Send to eligible residents across Sri Lanka.</Text> : null}
  </View>;
}

// LDFEW-115: confirmation dialog for irreversible lifecycle transitions.
function ConfirmDialog({ title, message, cancelLabel = 'Cancel', confirmLabel, busyLabel = 'Please wait...', onCancel, onConfirm, busy }: {
  title: string; message: string; cancelLabel?: string; confirmLabel: string; busyLabel?: string;
  onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <View style={lifecycleStyles.dialog}>
      <Text style={lifecycleStyles.dialogTitle}>{title}</Text>
      <Text style={lifecycleStyles.dialogMessage}>{message}</Text>
      <View style={lifecycleStyles.dialogActions}>
        <AssessmentButton label={cancelLabel} secondary disabled={busy} onPress={onCancel} />
        <AssessmentButton label={busy ? busyLabel : confirmLabel} disabled={busy} onPress={onConfirm} />
      </View>
    </View>
  );
}

function LifecycleActions({
  visible,
  canEdit,
  canCancel,
  canArchive,
  busy,
  onEdit,
  onCancel,
  onArchive
}: {
  visible: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canArchive: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onArchive: () => void;
}) {
  if (!visible) return null;

  return <View style={lifecycleStyles.lifecycleActions}>
    {canEdit ? (
      <AssessmentButton
        label="Edit Warning"
        secondary
        disabled={busy}
        onPress={onEdit}
      />
    ) : null}
    {canCancel ? (
      <AssessmentButton
        label="Cancel Warning"
        secondary
        disabled={busy}
        onPress={onCancel}
      />
    ) : null}
    {canArchive ? (
      <AssessmentButton
        label="Archive Warning"
        secondary
        disabled={busy}
        onPress={onArchive}
      />
    ) : null}
  </View>;
}

export function PublishWarningScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ warningId?: string | string[]; mode?: string | string[]; returnTo?: string | string[] }>();
  const warningId = Array.isArray(params.warningId) ? params.warningId[0] : params.warningId;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const [publishedResult, setPublishedWarning] = useState<SafeWarning | null>(null);
  const publishedWarning = publishedResult && publishedResult.id === warningId ? publishedResult : null;
  const [notificationTarget, setNotificationTarget] = useState<NotificationTargetSelection>({ scope: 'AFFECTED_AREA' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'publish' | 'cancel' | 'archive' | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleSuccess, setLifecycleSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<WarningForm>(initialWarningForm);
  const [editErrors, setEditErrors] = useState<WarningFormErrors>({});
  const [acknowledgements, setAcknowledgements] = useState<WarningAcknowledgementsResponse | null>(null);
  const [acknowledgementsLoading, setAcknowledgementsLoading] = useState(false);
  const [acknowledgementsError, setAcknowledgementsError] = useState<string | null>(null);
  const [acknowledgementsRevision, setAcknowledgementsRevision] = useState(0);
  const acknowledgementsRequest = useRef(0);
  const publishInFlight = useRef(false);
  const lifecycleInFlight = useRef(false);

  const goBack = () => {
    const destination = returnTo?.startsWith('/officer/') || returnTo === '/officer'
      ? returnTo
      : null;
    if (destination) {
      router.replace(destination);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/officer/warnings');
  };

  const load = useCallback(async () => {
    if (!accessToken || !warningId) throw new Error('A warning reference is required.');
    return getWarning(warningId, accessToken);
  }, [accessToken, warningId]);
  const resource = useAssessmentResource(load);
  const loadedWarning = resource.data?.warning;
  const warning = loadedWarning && loadedWarning.id === warningId ? loadedWarning : undefined;
  const displayedWarning = publishedWarning ?? warning;
  const hasPublishedHistory = displayedWarning?.status === 'PUBLISHED' || Boolean(displayedWarning?.publishedAt);
  const delivery = useWarningDelivery(warningId, accessToken, hasPublishedHistory);
  useEffect(() => {
    if (!warning || warning.id !== warningId) return;
    setNotificationTarget(warning.notificationTarget ?? { scope: 'AFFECTED_AREA' });
  }, [warning?.id, warning?.notificationTarget, warningId]);
  useEffect(() => {
    const requestId = ++acknowledgementsRequest.current;
    if (!accessToken || !warningId || !hasPublishedHistory) {
      setAcknowledgements(null);
      setAcknowledgementsLoading(false);
      setAcknowledgementsError(null);
      return;
    }
    let active = true;
    setAcknowledgements(null);
    setAcknowledgementsLoading(true);
    setAcknowledgementsError(null);
    void getWarningAcknowledgements(warningId, accessToken)
      .then((result) => { if (active) setAcknowledgements(result); })
      .catch(() => { if (active) setAcknowledgementsError('Unable to load resident responses.'); })
      .finally(() => {
        if (active && requestId === acknowledgementsRequest.current) {
          setAcknowledgementsLoading(false);
        }
      });
    return () => { active = false; acknowledgementsRequest.current += 1; };
  }, [accessToken, warningId, hasPublishedHistory, acknowledgementsRevision]);

  const retryAcknowledgements = () => {
    if (acknowledgementsLoading) return;
    setAcknowledgementsRevision((value) => value + 1);
  };

  const publish = async () => {
    if (!accessToken || !warningId || busy || publishInFlight.current) return;
    if (!isPublishableNotificationTarget(notificationTarget)) {
      setActionError('Select a district before publishing this warning.');
      return;
    }
    publishInFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await publishWarning(warningId, { notificationTarget }, accessToken);
      setPublishedWarning(null);
      const refreshed = await resource.reload();
      setConfirmAction(null);
      if (!refreshed || refreshed.warning.status !== 'PUBLISHED') {
        setActionError('The warning was published, but the latest status could not be confirmed. Please reload.');
        return;
      }
    } catch (failure) {
      setConfirmAction(null);
      setActionError(warningPublishErrorMessage(failure));
    } finally {
      publishInFlight.current = false;
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
    if (!accessToken || !warningId || lifecycleBusy || lifecycleInFlight.current) return;
    const errors = validateWarningForm(editForm);
    if (Object.keys(errors).length > 0) { setEditErrors(errors); return; }
    lifecycleInFlight.current = true;
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
      setPublishedWarning(null);
      setLifecycleSuccess('Warning updated successfully.');
      void resource.reload();
    } catch (failure) {
      setActionError(warningLifecycleErrorMessage(failure));
    } finally {
      lifecycleInFlight.current = false;
      setLifecycleBusy(false);
    }
  };

  // LDFEW-115: perform the confirmed cancel or archive transition.
  const confirmLifecycleAction = async (action: 'cancel' | 'archive') => {
    if (!accessToken || !warningId || lifecycleBusy || lifecycleInFlight.current) return;
    lifecycleInFlight.current = true;
    setLifecycleBusy(true);
    setActionError(null);
    try {
      let result: CancelWarningResponse | ArchiveWarningResponse;
      const expectedStatus = action === 'cancel' ? 'CANCELLED' : 'ARCHIVED';
      if (action === 'cancel') {
        result = await cancelWarning(warningId, accessToken);
      } else {
        result = await archiveWarning(warningId, accessToken);
      }
      setPublishedWarning(null);
      const refreshed = await resource.reload();
      setConfirmAction(null);
      if (!refreshed || refreshed.warning.status !== expectedStatus) {
        setActionError('The warning action completed, but the latest status could not be confirmed. Please reload.');
        return result;
      }
      setLifecycleSuccess(action === 'cancel' ? 'Warning cancelled successfully.' : 'Warning archived successfully.');
      return result;
    } catch (failure) {
      setActionError(warningLifecycleErrorMessage(failure));
    } finally {
      lifecycleInFlight.current = false;
      setLifecycleBusy(false);
    }
  };

  const isPublished = displayedWarning?.status === 'PUBLISHED';
  if (!displayedWarning) {
    return <WarningPage title="Publish Warning" onBack={goBack} busy={busy || lifecycleBusy}>
      <AssessmentLoadState loading={resource.loading} error={resource.error} retry={() => void resource.reload()} />
    </WarningPage>;
  }

  // LDFEW-115: determine which lifecycle actions are permitted based on the
  // backend-sourced status. Published content is immutable after delivery.
  const currentStatus = displayedWarning.status;
  const canEdit = currentStatus === 'DRAFT';
  const canCancel = currentStatus === 'DRAFT' || currentStatus === 'PUBLISHED';
  const canArchive = currentStatus === 'CANCELLED';
  const currentLifecycleDate = lifecycleDate(displayedWarning);

  return <WarningPage title={isPublished ? 'Published Warning' : mode === 'view' ? 'View Warning' : mode === 'draft' ? 'View/Edit Draft' : 'Publish Warning'} published={isPublished} status={displayedWarning.status} onBack={goBack} busy={busy || lifecycleBusy}>
    {publishedWarning && !editing && !confirmAction ? <View style={styles.publishedPanel}>
      <View style={styles.publishedHeader}><View style={styles.headerCopy}><Text style={styles.eyebrow}>EARLY WARNING · PUBLISHED</Text><Text style={styles.publishedTitle}>Warning Published</Text></View><PriorityBadge priority={publishedWarning.riskLevel} /></View>
      <View style={styles.statusPill}><Text style={styles.statusDot}>●</Text><Text style={styles.statusText}>PUBLISHED</Text></View>
      <AssessmentDetail label="Status" value="PUBLISHED" />
      <AssessmentDetail label="Affected Area" value={publishedWarning.affectedArea} />
      <AssessmentDetail label="Notification Target" value={targetLabel(publishedWarning.notificationTarget, publishedWarning.affectedArea)} />
      <AssessmentDetail label="Published At" value={formatWarningDate(publishedWarning.publishedAt)} />
      <AssessmentButton label="View Warning" onPress={() => router.replace({ pathname: '/officer/warnings/[warningId]', params: { warningId, mode: 'view', ...(returnTo ? { returnTo } : {}) } })} />
      <WarningDeliveryPanel delivery={delivery.data} loading={delivery.loading} error={delivery.error} onRetry={delivery.reload} />
      <ResidentResponsesState
        data={acknowledgements}
        loading={acknowledgementsLoading}
        error={acknowledgementsError}
        onRetry={retryAcknowledgements}
      />
      <LifecycleActions
        visible
        canEdit={canEdit}
        canCancel={canCancel}
        canArchive={canArchive}
        busy={lifecycleBusy || busy}
        onEdit={() => openEdit(publishedWarning)}
        onCancel={() => { setConfirmAction('cancel'); setActionError(null); setLifecycleSuccess(null); }}
        onArchive={() => { setConfirmAction('archive'); setActionError(null); setLifecycleSuccess(null); }}
      />
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
      <AssessmentDetail label={currentLifecycleDate.label} value={formatWarningDate(currentLifecycleDate.value)} />
      {displayedWarning.status !== 'DRAFT' && displayedWarning.status !== 'PUBLISHED' && displayedWarning.publishedAt ? <AssessmentDetail label="Published" value={formatWarningDate(displayedWarning.publishedAt)} /> : null}
      {displayedWarning.status === 'ARCHIVED' && displayedWarning.cancelledAt ? <AssessmentDetail label="Cancelled" value={formatWarningDate(displayedWarning.cancelledAt)} /> : null}
      {displayedWarning.status === 'DRAFT' ? <NotificationTargetSelector target={notificationTarget} onChange={setNotificationTarget} affectedArea={displayedWarning.affectedArea} /> : <View style={styles.infoCard}><Text style={styles.cardTitle}>Notification Target</Text><Text style={styles.cardSubtitle}>{hasPublishedHistory ? 'Target selected when this warning was published' : 'This warning was cancelled before publication.'}</Text><AssessmentDetail label="Target" value={hasPublishedHistory ? targetLabel(displayedWarning.notificationTarget, displayedWarning.affectedArea) : 'Not published'} /></View>}
      {actionError ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{actionError}</Text> : null}
      {hasPublishedHistory ? <WarningDeliveryPanel delivery={delivery.data} loading={delivery.loading} error={delivery.error} onRetry={delivery.reload} /> : null}
      {hasPublishedHistory ? <ResidentResponsesState
        data={acknowledgements}
        loading={acknowledgementsLoading}
        error={acknowledgementsError}
        onRetry={retryAcknowledgements}
      /> : null}
      {displayedWarning.status === 'DRAFT' ? !displayedWarning.affectedArea.trim() ? <Text accessibilityRole="alert" style={assessmentStyles.error}>The saved warning has no affected area.</Text> : !isPublishableNotificationTarget(notificationTarget) ? <Text accessibilityRole="alert" style={assessmentStyles.error}>Select a district before publishing this warning.</Text> : confirmAction === 'publish' ? <ConfirmDialog
        title="Publish warning?"
        message="This warning will become active and notifications may be sent to eligible residents."
        cancelLabel="Cancel"
        confirmLabel="Publish Warning"
        busyLabel="Publishing..."
        busy={busy}
        onCancel={() => { setConfirmAction(null); setActionError(null); }}
        onConfirm={() => void publish()}
      /> : <AssessmentButton label="Review & Publish" disabled={busy || Boolean(confirmAction)} onPress={() => { setConfirmAction('publish'); setActionError(null); setLifecycleSuccess(null); }} /> : <Text style={displayedWarning.status === 'PUBLISHED' ? lifecycleStyles.publishedNotice : lifecycleStyles.closedNotice}>
        {displayedWarning.status === 'PUBLISHED'
          ? 'This warning is published and active.'
          : displayedWarning.status === 'CANCELLED'
            ? 'This warning is cancelled and is no longer active.'
          : 'This warning is archived and is no longer active.'}
      </Text>}

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
          title="Cancel warning?"
          message="This warning will no longer be active. Previously delivered notifications cannot be recalled."
          cancelLabel="Keep Warning"
          confirmLabel="Cancel Warning"
          busyLabel="Cancelling..."
          busy={lifecycleBusy}
          onCancel={() => { setConfirmAction(null); setActionError(null); }}
          onConfirm={() => void confirmLifecycleAction('cancel')}
        />
      ) : null}

      {/* LDFEW-115: archive confirmation dialog */}
      {confirmAction === 'archive' ? (
        <ConfirmDialog
          title="Archive warning?"
          message="This warning will be archived and will remain available as historical information."
          cancelLabel="Keep Warning"
          confirmLabel="Archive Warning"
          busyLabel="Archiving..."
          busy={lifecycleBusy}
          onCancel={() => { setConfirmAction(null); setActionError(null); }}
          onConfirm={() => void confirmLifecycleAction('archive')}
        />
      ) : null}

      {/* LDFEW-115: lifecycle action buttons — hidden while a dialog or edit form is open */}
      <LifecycleActions
        visible={!editing && !confirmAction}
        canEdit={canEdit}
        canCancel={canCancel}
        canArchive={canArchive}
        busy={lifecycleBusy || busy}
        onEdit={() => openEdit(displayedWarning)}
        onCancel={() => { setConfirmAction('cancel'); setActionError(null); setLifecycleSuccess(null); }}
        onArchive={() => { setConfirmAction('archive'); setActionError(null); setLifecycleSuccess(null); }}
      />
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

function ResidentResponsesState({ data, loading, error, onRetry }: {
  data: WarningAcknowledgementsResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return <View style={responseStyles.feedback}>
      <ActivityIndicator color={dashboardTheme.colors.primary} />
      <Text style={responseStyles.emptyText}>Loading resident responses...</Text>
    </View>;
  }
  if (error) {
    return <View style={responseStyles.feedback}>
      <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text>
      <AssessmentButton label="Retry resident responses" onPress={onRetry} />
    </View>;
  }
  return data ? <ResidentResponses data={data} /> : null;
}

const publishStyles = {
  targetCard: { gap: 12, padding: 16, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted } as const,
  targetOption: { minHeight: 48, paddingHorizontal: 12, borderRadius: dashboardTheme.radius.sm, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface } as const,
  targetOptionSelected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft } as const,
  targetOptionText: { color: dashboardTheme.colors.text, fontWeight: '700' as const } as const,
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: dashboardTheme.colors.muted } as const,
  radioSelected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primary } as const,
  districtSelector: { gap: 8 } as const,
  districtSelectButton: { minHeight: 54, paddingHorizontal: 14, borderRadius: dashboardTheme.radius.sm, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface } as const,
  districtPin: { color: dashboardTheme.colors.primaryStrong, fontSize: 20, fontWeight: '800' as const } as const,
  districtSelectText: { flex: 1, color: dashboardTheme.colors.text, fontSize: 16, fontWeight: '700' as const } as const,
  districtPlaceholder: { color: dashboardTheme.colors.muted, fontWeight: '600' as const } as const,
  districtChevron: { color: dashboardTheme.colors.primaryStrong, fontSize: 22, lineHeight: 22, fontWeight: '900' as const } as const,
  scopeConfirmation: { gap: 2, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: dashboardTheme.colors.successSoft, borderWidth: 1, borderColor: '#bbf7d0' } as const,
  scopeConfirmationTitle: { color: dashboardTheme.colors.success, fontSize: 12, fontWeight: '800' as const } as const,
  scopeConfirmationValue: { color: dashboardTheme.colors.text, fontSize: 14, fontWeight: '700' as const } as const,
  countryNotice: { padding: 12, borderRadius: 10, backgroundColor: dashboardTheme.colors.primarySoft, color: dashboardTheme.colors.primaryStrong, fontSize: 13, lineHeight: 19 } as const,
  modalOverlay: { flex: 1, padding: 16, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(15, 23, 42, 0.48)' } as const,
  modalBackdrop: StyleSheet.absoluteFill,
  modalCard: { width: '100%' as const, maxWidth: 560, maxHeight: '90%' as const, gap: 14, padding: 18, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface, borderWidth: 1, borderColor: dashboardTheme.colors.border, ...cardShadow } as const,
  modalHeader: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: 12 } as const,
  modalHeaderCopy: { flex: 1, gap: 3 } as const,
  modalTitle: { color: dashboardTheme.colors.text, fontSize: 19, fontWeight: '800' as const } as const,
  modalSubtitle: { color: dashboardTheme.colors.muted, fontSize: 13, lineHeight: 19 } as const,
  modalClose: { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 20, backgroundColor: dashboardTheme.colors.surfaceMuted } as const,
  modalCloseText: { color: dashboardTheme.colors.text, fontSize: 26, lineHeight: 28, fontWeight: '500' as const } as const,
  districtSearch: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm, fontSize: 16, color: dashboardTheme.colors.text, backgroundColor: dashboardTheme.colors.surfaceMuted } as const,
  districtList: { flexShrink: 1, maxHeight: 420 } as const,
  districtOption: { minHeight: 50, paddingHorizontal: 13, borderRadius: 10, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface, marginBottom: 8 } as const,
  districtOptionSelected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft } as const,
  districtOptionText: { flex: 1, color: dashboardTheme.colors.text, fontSize: 15, fontWeight: '600' as const } as const,
  districtOptionTextSelected: { color: dashboardTheme.colors.primaryStrong, fontWeight: '800' as const } as const,
  districtCheck: { color: dashboardTheme.colors.primaryStrong, fontSize: 20, fontWeight: '900' as const } as const,
  noDistricts: { paddingVertical: 18, color: dashboardTheme.colors.muted, fontSize: 14, textAlign: 'center' as const } as const,
  pressed: { opacity: 0.7 } as const
};
// LDFEW-115: styles for lifecycle action panels and confirmation dialogs.
const lifecycleStyles = StyleSheet.create({
  lifecycleActions: { gap: 10, marginTop: 8 },
  publishedNotice: { color: dashboardTheme.colors.primaryStrong, fontSize: 14, lineHeight: 21, fontWeight: '700', paddingVertical: 8 },
  closedNotice: { color: dashboardTheme.colors.muted, fontSize: 14, lineHeight: 21, fontWeight: '700', paddingVertical: 8 },
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
const responseStyles = { card: { gap: 14, marginTop: 16, padding: 20, borderRadius: 16, backgroundColor: dashboardTheme.colors.surface, borderWidth: 1, borderColor: dashboardTheme.colors.border, ...cardShadow } as const, feedback: { gap: 12, alignItems: 'center' as const, marginTop: 16, padding: 20, borderRadius: 16, backgroundColor: dashboardTheme.colors.surface, borderWidth: 1, borderColor: dashboardTheme.colors.border }, title: { color: dashboardTheme.colors.text, fontSize: 20, fontWeight: '900' as const }, subtitle: { color: dashboardTheme.colors.muted, fontSize: 13, lineHeight: 19 }, summary: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 9 }, stat: { flexGrow: 1, flexBasis: '46%' as const, minWidth: 120, gap: 6, padding: 13, borderRadius: 12, borderWidth: 1 }, total: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }, safe: { backgroundColor: dashboardTheme.colors.successSoft, borderColor: '#bbf7d0' }, evacuating: { backgroundColor: dashboardTheme.colors.highSoft, borderColor: '#fed7aa' }, assistance: { backgroundColor: dashboardTheme.colors.criticalSoft, borderColor: '#fecaca' }, statLabel: { color: dashboardTheme.colors.muted, fontSize: 12, fontWeight: '800' as const }, statCount: { color: dashboardTheme.colors.text, fontSize: 24, fontWeight: '900' as const }, person: { gap: 7, padding: 15, borderRadius: 12, backgroundColor: dashboardTheme.colors.surfaceMuted, borderWidth: 1, borderColor: dashboardTheme.colors.border }, personHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 }, name: { flex: 1, color: dashboardTheme.colors.text, fontSize: 16, fontWeight: '900' as const }, detail: { color: dashboardTheme.colors.muted, fontSize: 13 }, responseBadge: { maxWidth: '62%' as const, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 }, safeBadge: { backgroundColor: dashboardTheme.colors.successSoft }, evacuatingBadge: { backgroundColor: dashboardTheme.colors.highSoft }, need_assistanceBadge: { backgroundColor: dashboardTheme.colors.criticalSoft }, responseBadgeText: { color: dashboardTheme.colors.text, fontSize: 12, fontWeight: '800' as const }, empty: { alignItems: 'center' as const, gap: 5, paddingVertical: 14 }, emptyTitle: { color: dashboardTheme.colors.text, fontWeight: '800' as const }, emptyText: { color: dashboardTheme.colors.muted, fontSize: 13, textAlign: 'center' as const } };
