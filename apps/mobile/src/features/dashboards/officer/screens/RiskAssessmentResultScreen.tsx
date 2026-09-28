import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  RISK_ASSESSMENT_DELETE_REASONS, RISK_ASSESSMENT_MANUAL_CLOSURE_REASONS, canCreateWarning,
  type ManualRiskAssessmentClosureReason, type RiskAssessmentDeleteReason, type SafeRiskAssessment, type SafeUser, type SafeWarning
} from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '../../../../services/api/client';
import { closeRiskAssessment, getRiskAssessment, getRiskAssessmentHistory, softDeleteRiskAssessment } from '../api/riskAssessmentApi';
import { getWarningByAssessment } from '../api/warningApi';
import {
  assessmentErrorMessage, buildCloseRiskAssessmentRequest, buildDeleteRiskAssessmentRequest
} from '../riskAssessmentForm';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { dashboardTheme } from '../../shared/theme';
import {
  AssessmentButton, AssessmentDetail, AssessmentFactorSummary, AssessmentLoadState, AssessmentOptions, AssessmentPage,
  IncidentAssessmentContext, assessmentStyles
} from '../components/RiskAssessmentComponents';

type AssessmentHistoryState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; assessments: SafeRiskAssessment[] };

export function RiskAssessmentResultScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const [historyState, setHistoryState] = useState<AssessmentHistoryState>({ kind: 'loading' });
  const [historyRetry, setHistoryRetry] = useState(0);
  const [closedAssessment, setClosedAssessment] = useState<{
    routeId: string; accessToken: string; generation: number; assessment: SafeRiskAssessment;
  } | null>(null);
  const [closeFormScope, setCloseFormScope] = useState<{
    routeId: string | undefined; accessToken: string | null; generation: number;
  } | null>(null);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closureReason, setClosureReason] = useState<ManualRiskAssessmentClosureReason>('INCIDENT_RESOLVED');
  const [closureNote, setClosureNote] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [staleClose, setStaleClose] = useState(false);
  const [deleteFormScope, setDeleteFormScope] = useState<{
    routeId: string | undefined; accessToken: string | null; generation: number;
  } | null>(null);
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deleteReason, setDeleteReason] = useState<RiskAssessmentDeleteReason>('CREATED_BY_MISTAKE');
  const [deleteNote, setDeleteNote] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [existingWarning, setExistingWarning] = useState<SafeWarning | null>(null);
  const [, refreshPending] = useState(0);
  const params = useLocalSearchParams<{ assessmentId?: string | string[] }>();
  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const closeContext = useRef({ assessmentId, accessToken, generation: 0 });
  if (closeContext.current.assessmentId !== assessmentId || closeContext.current.accessToken !== accessToken) {
    closeContext.current = { assessmentId, accessToken, generation: closeContext.current.generation + 1 };
  }
  const closeGeneration = closeContext.current.generation;
  const pendingCloses = useRef<Array<{ assessmentId: string; accessToken: string }>>([]);
  const pendingDeletes = useRef<Array<{ assessmentId: string; accessToken: string }>>([]);
  const pendingForCurrent = pendingCloses.current.some((pending) =>
    pending.assessmentId === assessmentId && pending.accessToken === accessToken);
  const pendingDeleteForCurrent = pendingDeletes.current.some((pending) =>
    pending.assessmentId === assessmentId && pending.accessToken === accessToken);
  const currentForm = closeFormScope !== null && closeFormScope.routeId === assessmentId
    && closeFormScope.accessToken === accessToken && closeFormScope.generation === closeGeneration;
  const closeFormVisible = showCloseForm && currentForm;
  const currentDeleteForm = deleteFormScope !== null && deleteFormScope.routeId === assessmentId
    && deleteFormScope.accessToken === accessToken && deleteFormScope.generation === closeGeneration;
  const deleteFormVisible = showDeleteForm && currentDeleteForm;
  const currentBusy = pendingForCurrent || pendingDeleteForCurrent;
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!assessmentId) throw new Error('An assessment reference is required.');
    // Always retrieve persisted state, including when opening this route directly.
    return getRiskAssessment(assessmentId, accessToken);
  }, [accessToken, assessmentId]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  const currentClose = closedAssessment && closedAssessment.routeId === assessmentId
    && closedAssessment.accessToken === accessToken
    && closedAssessment.generation === closeGeneration
    && closedAssessment.assessment.id === data?.assessment.id ? closedAssessment.assessment : null;
  const displayedAssessment = currentClose ?? data?.assessment;
  useEffect(() => {
    if (!data) return;
    let isActive = true;
    setHistoryState({ kind: 'loading' });
    if (!accessToken) {
      setHistoryState({ kind: 'error' });
      return () => { isActive = false; };
    }

    void getRiskAssessmentHistory(data.assessment.incidentId, accessToken)
      .then(({ assessments }) => {
        if (isActive) setHistoryState({ kind: 'loaded', assessments });
      })
      .catch(() => {
        if (isActive) setHistoryState({ kind: 'error' });
      });
    return () => { isActive = false; };
  }, [data, accessToken, historyRetry]);
  const retryHistory = useCallback(() => setHistoryRetry((retry) => retry + 1), []);
  useEffect(() => {
    if (!accessToken || !assessmentId) { setExistingWarning(null); return; }
    let isActive = true;
    void getWarningByAssessment(assessmentId, accessToken)
      .then((result) => { if (isActive) setExistingWarning(result.warning); })
      .catch(() => { if (isActive) setExistingWarning(null); });
    return () => { isActive = false; };
  }, [accessToken, assessmentId]);
  const submitClose = useCallback(async () => {
    if (!closeFormVisible || !displayedAssessment || displayedAssessment.status !== 'ACTIVE'
      || !accessToken || pendingCloses.current.some((pending) =>
        pending.assessmentId === displayedAssessment.id && pending.accessToken === accessToken)) return;
    let input;
    try {
      input = buildCloseRiskAssessmentRequest(closureReason, closureNote);
    } catch (failure) {
      setCloseError(assessmentErrorMessage(failure));
      return;
    }
    const pending = { assessmentId: displayedAssessment.id, accessToken };
    pendingCloses.current.push(pending);
    refreshPending((version) => version + 1);
    setCloseError(null);
    setStaleClose(false);
    try {
      const response = await closeRiskAssessment(displayedAssessment.id, input, accessToken);
      if (closeContext.current.generation !== closeGeneration) return;
      setClosedAssessment({ routeId: assessmentId!, accessToken, generation: closeGeneration, assessment: response.assessment });
      setShowCloseForm(false);
      setHistoryRetry((retry) => retry + 1);
    } catch (failure) {
      if (closeContext.current.generation !== closeGeneration) return;
      setCloseError(assessmentErrorMessage(failure));
      setStaleClose(failure instanceof ApiClientError && failure.code === 'ASSESSMENT_NOT_ACTIVE');
    } finally {
      pendingCloses.current = pendingCloses.current.filter((request) => request !== pending);
      refreshPending((version) => version + 1);
    }
  }, [accessToken, assessmentId, closeFormVisible, closeGeneration, closureNote, closureReason, displayedAssessment]);
  const submitDelete = useCallback(async () => {
    if (!deleteFormVisible || !displayedAssessment || displayedAssessment.status !== 'CLOSED'
      || !accessToken || pendingDeletes.current.some((pending) =>
        pending.assessmentId === displayedAssessment.id && pending.accessToken === accessToken)) return;
    let input;
    try {
      input = buildDeleteRiskAssessmentRequest(deleteReason, deleteNote);
    } catch (failure) {
      setDeleteError(assessmentErrorMessage(failure));
      return;
    }
    const pending = { assessmentId: displayedAssessment.id, accessToken };
    pendingDeletes.current.push(pending);
    refreshPending((version) => version + 1);
    setDeleteError(null);
    try {
      await softDeleteRiskAssessment(displayedAssessment.id, input, accessToken);
      if (closeContext.current.generation !== closeGeneration) return;
      setShowDeleteForm(false);
      setHistoryRetry((retry) => retry + 1);
      router.replace({ pathname: '/officer/assessments', params: { refresh: Date.now().toString() } });
    } catch (failure) {
      if (closeContext.current.generation !== closeGeneration) return;
      setDeleteError(assessmentErrorMessage(failure));
    } finally {
      pendingDeletes.current = pendingDeletes.current.filter((request) => request !== pending);
      refreshPending((version) => version + 1);
    }
  }, [accessToken, closeGeneration, deleteFormVisible, deleteNote, deleteReason, displayedAssessment, router]);
  return <AssessmentPage title="Risk Assessment Result">
    {!data ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : <>
      <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.heading}>Saved assessment · {displayedAssessment!.status}</Text>
        <Text style={assessmentStyles.label}>Final Risk Level</Text>
        <PriorityBadge priority={displayedAssessment!.finalRiskLevel} />
        <AssessmentDetail label="Decision Reason" value={displayedAssessment!.decisionReason ?? 'Suggested risk accepted without an additional reason.'} />
        <AssessmentDetail label="Assessment Date / Time" value={new Date(displayedAssessment!.assessedAt).toLocaleString()} />
        <AssessmentDetail label="Assessed By" value={user?.id === displayedAssessment!.assessedById ? user.name : displayedAssessment!.assessedById} />
        <AssessmentDetail label="Assessment Reference" value={displayedAssessment!.id} />
        {displayedAssessment!.closureReason ? <AssessmentDetail label="Closure Reason" value={displayedAssessment!.closureReason} /> : null}
        {displayedAssessment!.closureNote ? <AssessmentDetail label="Closure Note" value={displayedAssessment!.closureNote} /> : null}
      </View>
      {displayedAssessment!.status === 'ACTIVE' && canCreateWarning(displayedAssessment!.finalRiskLevel) ? existingWarning ? <AssessmentButton
        label={existingWarning.status === 'PUBLISHED' ? 'View Published Warning' : 'View/Edit Draft'}
        disabled={currentBusy}
        onPress={() => router.push({ pathname: '/officer/warnings/[warningId]', params: { warningId: existingWarning.id } })} /> : <AssessmentButton
        label="Create Warning" disabled={currentBusy} onPress={() => router.push({
          pathname: '/officer/warnings/create', params: { assessmentId: displayedAssessment!.id }
        })} /> : null}
      {displayedAssessment!.status === 'ACTIVE' ? <AssessmentButton label="REASSESS RISK" disabled={currentBusy} onPress={() => router.push({
        pathname: '/officer/assessments/create', params: { assessmentId: displayedAssessment!.id }
      })} /> : null}
      {displayedAssessment!.status === 'ACTIVE' && !closeFormVisible ? <AssessmentButton label="CLOSE ASSESSMENT" disabled={currentBusy}
        onPress={() => {
          setCloseFormScope({ routeId: assessmentId, accessToken, generation: closeGeneration });
          setClosureReason('INCIDENT_RESOLVED'); setClosureNote('');
          setCloseError(null); setStaleClose(false); setShowCloseForm(true);
        }} /> : null}
      {displayedAssessment!.status === 'CLOSED' && !deleteFormVisible ? <AssessmentButton label="DELETE ASSESSMENT"
        disabled={currentBusy} onPress={() => {
          setDeleteFormScope({ routeId: assessmentId, accessToken, generation: closeGeneration });
          setDeleteReason('CREATED_BY_MISTAKE'); setDeleteNote(''); setDeleteError(null); setShowDeleteForm(true);
        }} /> : null}
      {displayedAssessment!.status === 'CLOSED' && deleteFormVisible ? <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.heading}>Delete assessment</Text>
        <Text style={assessmentStyles.helper}>This hides the closed assessment from normal history. Its audit record remains stored.</Text>
        <AssessmentOptions label="Delete Reason" options={RISK_ASSESSMENT_DELETE_REASONS}
          value={deleteReason} onChange={setDeleteReason} disabled={currentBusy} />
        <View style={assessmentStyles.detail}>
          <Text style={assessmentStyles.label}>Delete Note</Text>
          <TextInput accessibilityLabel="Delete Note" value={deleteNote} onChangeText={setDeleteNote}
            placeholder={deleteReason === 'OTHER' ? 'Explain why this record is being hidden' : 'Optional details'}
            multiline editable={!currentBusy} style={assessmentStyles.input} />
        </View>
        {deleteError ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{deleteError}</Text> : null}
        <AssessmentButton label="Confirm Delete" disabled={currentBusy} onPress={() => void submitDelete()} />
        <AssessmentButton label="Cancel" secondary disabled={currentBusy} onPress={() => setShowDeleteForm(false)} />
      </View> : null}
      {displayedAssessment!.status === 'ACTIVE' && closeFormVisible ? <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.heading}>Close assessment</Text>
        <Text style={assessmentStyles.helper}>Confirm the reason for closing this assessment. This action cannot be undone.</Text>
        <AssessmentOptions label="Closure Reason" options={RISK_ASSESSMENT_MANUAL_CLOSURE_REASONS}
          value={closureReason} onChange={setClosureReason} disabled={currentBusy} />
        <View style={assessmentStyles.detail}>
          <Text style={assessmentStyles.label}>Closure Note</Text>
          <TextInput accessibilityLabel="Closure Note" value={closureNote} onChangeText={setClosureNote}
            placeholder={closureReason === 'OTHER' ? 'Explain why this assessment is closing' : 'Optional details'}
            multiline editable={!currentBusy} style={assessmentStyles.input} />
        </View>
        {closeError ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{closeError}</Text> : null}
        {staleClose ? <AssessmentButton label="Refresh Assessment" onPress={() => void reload()} /> : null}
        <AssessmentButton label="Confirm Close" disabled={currentBusy} onPress={() => void submitClose()} />
        <AssessmentButton label="Cancel" secondary disabled={currentBusy} onPress={() => setShowCloseForm(false)} />
      </View> : null}
      {currentClose ? <Text accessibilityRole="alert" style={assessmentStyles.helper}>Assessment closed.</Text> : null}
      <AssessmentFactorSummary factors={displayedAssessment!} />
      <IncidentAssessmentContext incident={data.incident} reports={data.reports} />
      <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.heading}>System suggested risk</Text>
        <PriorityBadge priority={data.assessment.systemSuggestedRisk} />
        <AssessmentDetail label="System Calculated Score" value={data.assessment.calculatedScore} />
        <Text style={assessmentStyles.helper}>This backend-calculated recommendation is separate from the final officer decision above.</Text>
      </View>
      <AssessmentHistorySection
        state={historyState}
        officer={user ? { id: user.id, name: user.name } : null}
        onRetry={retryHistory}
        onViewAssessment={(historicalAssessmentId) => router.push({
          pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: historicalAssessmentId }
        })}
      />
    </>}
  </AssessmentPage>;
}

export function AssessmentHistorySection({
  state,
  officer,
  onRetry,
  onViewAssessment
}: {
  state: AssessmentHistoryState;
  officer: Pick<SafeUser, 'id' | 'name'> | null;
  onRetry: () => void;
  onViewAssessment?: (assessmentId: string) => void;
}) {
  return <View style={assessmentStyles.card}>
    <Text style={assessmentStyles.heading}>Assessment History</Text>
    {state.kind === 'loading' ? <>
      <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
      <Text style={assessmentStyles.helper}>Loading assessment history…</Text>
    </> : state.kind === 'error' ? <>
      <Text accessibilityRole="alert" style={assessmentStyles.error}>Unable to load assessment history.</Text>
      <AssessmentButton label="Retry" onPress={onRetry} />
    </> : state.assessments.length === 0 ? <Text style={assessmentStyles.helper}>
      No assessment history available.
    </Text> : state.assessments.map((assessment) => <View key={assessment.id} style={assessmentStyles.detail}>
      <Text style={assessmentStyles.label}>{assessment.status === 'ACTIVE' ? 'Current' : 'Historical'}</Text>
      <PriorityBadge priority={assessment.finalRiskLevel} />
      <AssessmentDetail label="Calculated Score" value={assessment.calculatedScore} />
      <AssessmentDetail label="Status" value={assessment.status} />
      <AssessmentDetail label="Assessment Date / Time" value={new Date(assessment.assessedAt).toLocaleString()} />
      <AssessmentDetail label="Assessed By" value={officer?.id === assessment.assessedById ? officer.name : assessment.assessedById} />
      {assessment.previousAssessmentId ? <AssessmentDetail label="Previous Assessment" value={assessment.previousAssessmentId} /> : null}
      {assessment.reassessmentReason ? <AssessmentDetail label="Reason for Reassessment" value={assessment.reassessmentReason} /> : null}
      {assessment.closureReason ? <AssessmentDetail label="Closure Reason" value={assessment.closureReason} /> : null}
      {assessment.closureNote ? <AssessmentDetail label="Closure Note" value={assessment.closureNote} /> : null}
      {assessment.closedAt ? <AssessmentDetail label="Closed At" value={new Date(assessment.closedAt).toLocaleString()} /> : null}
      {assessment.closedById ? <AssessmentDetail label="Closed By" value={officer?.id === assessment.closedById ? officer.name : assessment.closedById} /> : null}
      {assessment.status !== 'ACTIVE' && onViewAssessment ? <AssessmentButton label="VIEW HISTORICAL ASSESSMENT"
        onPress={() => onViewAssessment(assessment.id)} /> : null}
    </View>)}
  </View>;
}


