import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { RISK_DECISION_REASON_MAX_LENGTH, type RiskAssessmentFactors } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AssessmentButton, AssessmentDetail, AssessmentLoadState, AssessmentPage, assessmentStyles } from '../components/RiskAssessmentComponents';
import { AssessmentFactorFields, type AssessmentFactorSection } from '../components/AssessmentFactorFields';
import { getRiskAssessment, calculateRiskAssessment, reassessRiskAssessment } from '../api/riskAssessmentApi';
import { getIncidentMonitoringDetail } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { useRiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraft';
import { assessmentErrorMessage, buildReassessmentRiskAssessmentRequest,
  parseRiskAssessmentForm, reassessmentReasonError, validateRiskAssessmentForm, type RiskAssessmentForm } from '../riskAssessmentForm';
import { assessmentFactorChanges } from '../assessment-flow/assessmentFactorChanges';
import { RiskDecisionScreen } from './RiskDecisionScreen';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { formatOperationalTime } from '../../shared/formatOperationalTime';
import { useAssessmentDraftExitGuard } from '../hooks/useAssessmentDraftExitGuard';

type Step = 'reason' | 'situation' | 'impact' | 'environment' | 'review' | 'comparison' | 'decision';
const steps: Step[] = ['reason', 'situation', 'impact', 'environment', 'review', 'comparison', 'decision'];
const titles: Record<Step, string> = {
  reason: 'Reason & Evidence', situation: 'Update Situation', impact: 'Update Impact & Access',
  environment: 'Update Environment', review: 'Review Changes', comparison: 'Risk Comparison', decision: 'Final Decision'
};

export function ReassessmentWizardScreen() {
  const params = useLocalSearchParams<{ assessmentId?: string | string[]; step?: string | string[] }>();
  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const rawStep = Array.isArray(params.step) ? params.step[0] : params.step;
  const step = rawStep as Step;
  const validStep = steps.includes(step);
  const router = useRouter();
  const { accessToken } = useAuth();
  const { draft, isDirty, discardAssessmentDraft, initializeReassessment, updateSingleFactor, setReassessmentReason, setCalculationPreview,
    setFinalRisk, setDecisionReason, resetAssessmentDraft } = useRiskAssessmentDraft();
  const allowNextRemoval = useAssessmentDraftExitGuard(isDirty, discardAssessmentDraft);
  const draftRef = useRef(draft); draftRef.current = draft;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !assessmentId) throw new Error('An active assessment is required.');
    const assessmentResponse = await getRiskAssessment(assessmentId, accessToken);
    const assessment = assessmentResponse.assessment;
    if (!assessment || assessment.id !== assessmentId) throw new Error('The requested assessment is unavailable.');
    const detail = await getIncidentMonitoringDetail(assessment.incidentId, accessToken);
    return { assessment, detail };
  }, [accessToken, assessmentId]);
  const resource = useAssessmentResource(load);
  const data = resource.data?.assessment.id === assessmentId ? resource.data : null;
  const assessment = data?.assessment;
  const matchingDraft = draft?.mode === 'REASSESSMENT' && draft.assessmentId === assessmentId ? draft : null;
  const factorErrors = matchingDraft ? validateRiskAssessmentForm(matchingDraft.factors) : {};
  const factorSnapshot: RiskAssessmentFactors | null = matchingDraft && !Object.keys(factorErrors).length
    ? parseRiskAssessmentForm(matchingDraft.factors) : null;
  const changes = matchingDraft?.previousAssessment && factorSnapshot
    ? assessmentFactorChanges(matchingDraft.previousAssessment, factorSnapshot) : [];
  const reasonError = matchingDraft ? reassessmentReasonError(matchingDraft.reassessmentReason) : 'Enter a reassessment reason.';
  const preview = matchingDraft?.calculationPreview && resource.data?.assessment.status === 'ACTIVE'
    ? matchingDraft.calculationPreview : null;

  useFocusEffect(useCallback(() => {
    generation.current += 1; inFlight.current = false; setBusy(false); setError(null);
    return () => { generation.current += 1; };
  }, [assessmentId]));

  useEffect(() => {
    if (!assessment || assessment.status !== 'ACTIVE') return;
    if (draftRef.current?.mode === 'REASSESSMENT' && draftRef.current.assessmentId === assessment.id) return;
    initializeReassessment({ assessmentId: assessment.id, incidentId: assessment.incidentId,
      factors: assessment, finalRiskLevel: assessment.finalRiskLevel, previousAssessment: assessment });
  }, [assessment, initializeReassessment]);

  const go = (next: Step) => { setAttempted(false); setError(null); router.setParams({ step: next }); };
  const editFactor = <K extends keyof RiskAssessmentForm>(key: K, value: RiskAssessmentForm[K]) => {
    updateSingleFactor(key, value); setError(null);
  };
  const goMonitoring = () => router.replace({ pathname: '/officer/monitoring/[incidentId]',
    params: { incidentId: assessment?.incidentId ?? '', notice: 'assessment-updated' } });

  const calculate = async () => {
    if (busy || inFlight.current || !assessmentId || !accessToken || !assessment || !matchingDraft || !factorSnapshot || reasonError) return;
    const requestGeneration = generation.current; inFlight.current = true; setBusy(true); setError(null);
    try {
      const latest = await getRiskAssessment(assessmentId, accessToken);
      if (requestGeneration !== generation.current) return;
      if (latest.assessment?.id !== assessmentId || latest.assessment.status !== 'ACTIVE') throw new Error('This assessment is no longer active. Refresh to view the latest status.');
      const result = await calculateRiskAssessment({ incidentId: assessment.incidentId, ...factorSnapshot }, accessToken);
      if (requestGeneration !== generation.current) return;
      setCalculationPreview(factorSnapshot, result); setFinalRisk(result.systemSuggestedRisk); setDecisionReason(''); go('comparison');
    } catch (failure) { if (requestGeneration === generation.current) setError(assessmentErrorMessage(failure)); }
    finally { if (requestGeneration === generation.current) { inFlight.current = false; setBusy(false); } }
  };

  const save = async () => {
    if (busy || inFlight.current || !assessmentId || !accessToken || !assessment || !matchingDraft || !preview) return;
    let request;
    try { request = buildReassessmentRiskAssessmentRequest(preview.factors, matchingDraft.finalRiskLevel,
      preview.result.systemSuggestedRisk, matchingDraft.decisionReason, matchingDraft.reassessmentReason); }
    catch (failure) { setError(assessmentErrorMessage(failure)); return; }
    const requestGeneration = generation.current; inFlight.current = true; setBusy(true); setError(null);
    try {
      const latest = await getRiskAssessment(assessmentId, accessToken);
      if (requestGeneration !== generation.current) return;
      if (latest.assessment?.id !== assessmentId || latest.assessment.status !== 'ACTIVE') throw new Error('This assessment is no longer active. Refresh to view the latest status.');
      await reassessRiskAssessment(assessmentId, request, accessToken);
      if (requestGeneration === generation.current) { resetAssessmentDraft(); allowNextRemoval(); goMonitoring(); }
    } catch (failure) { if (requestGeneration === generation.current) setError(assessmentErrorMessage(failure)); }
    finally { if (requestGeneration === generation.current) { inFlight.current = false; setBusy(false); } }
  };

  if (!validStep || !assessmentId) return <AssessmentPage title="Reassess Risk"><Text accessibilityRole="alert" style={assessmentStyles.error}>This reassessment step is unavailable.</Text><AssessmentButton label="Monitoring" onPress={() => router.replace('/officer/monitoring')} /></AssessmentPage>;
  if (resource.loading || !data) return <AssessmentPage title="Reassess Risk"><AssessmentLoadState loading={resource.loading} error={resource.error} retry={() => void resource.reload()} /></AssessmentPage>;
  if (assessment?.status !== 'ACTIVE') return <AssessmentPage title="Reassess Risk"><Text accessibilityRole="alert" style={assessmentStyles.error}>This assessment is no longer active.</Text><AssessmentButton label="Monitoring" onPress={() => router.replace('/officer/monitoring')} /></AssessmentPage>;
  if (!matchingDraft) return <AssessmentPage title="Reassess Risk"><AssessmentLoadState loading error={null} retry={() => void resource.reload()} /></AssessmentPage>;

  const context = data.detail.monitoring;
  const verifiedReports = data.detail.recentVerifiedReports ?? [];
  const section = (step === 'situation' || step === 'impact' || step === 'environment') ? step as AssessmentFactorSection : null;
  return <AssessmentPage title={titles[step]}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={assessmentStyles.card}><Text style={assessmentStyles.heading}>{context.incident.hazardType} incident</Text>
          <PriorityBadge priority={assessment.finalRiskLevel} /><AssessmentDetail label="Current score" value={assessment.calculatedScore} />
          <AssessmentDetail label="Assessed" value={formatOperationalTime(assessment.assessedAt)} />
        </View>
        {step === 'reason' ? <View style={assessmentStyles.card}>
          <Text style={assessmentStyles.heading}>Why reassess?</Text>
          <Text style={assessmentStyles.helper}>New verified information, changing conditions, or a correction to an earlier assessment may prompt a review.</Text>
          <Text style={assessmentStyles.label}>Reassessment reason (required)</Text>
          <TextInput accessibilityLabel="Reassessment reason" multiline maxLength={RISK_DECISION_REASON_MAX_LENGTH}
            value={matchingDraft.reassessmentReason} onChangeText={(value) => { setReassessmentReason(value); setError(null); }}
            placeholder="Describe why the risk is being reassessed" style={[assessmentStyles.input, styles.multiline]} />
          <Text style={assessmentStyles.helper}>{matchingDraft.reassessmentReason.trim().length}/{RISK_DECISION_REASON_MAX_LENGTH}</Text>
          {attempted && reasonError ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{reasonError}</Text> : null}
          <AssessmentDetail label="New verified reports" value={context.newVerifiedReportsSinceAssessment} />
          {verifiedReports.length ? verifiedReports.slice(0, 5).map((report) => <Text key={report.id} style={assessmentStyles.body}>{report.description}</Text>)
            : <Text style={assessmentStyles.helper}>No new verified evidence is available. You can still reassess using current information.</Text>}
          <AssessmentButton label="CONTINUE" onPress={() => { setAttempted(true); if (!reasonError) go('situation'); }} />
        </View> : null}
        {section ? <AssessmentFactorFields section={section} factors={matchingDraft.factors} hazardType={context.incident.hazardType}
          errors={factorErrors} showErrors={attempted} onChange={editFactor}
          onBack={() => go(section === 'situation' ? 'reason' : section === 'impact' ? 'situation' : 'impact')}
          onContinue={() => { setAttempted(true); if (section === 'situation' && !Object.keys(factorErrors).length) go('impact');
            else if (section === 'impact') go('environment'); else if (section === 'environment' && !Object.keys(factorErrors).length) go('review'); }} /> : null}
        {step === 'review' ? <View style={assessmentStyles.card}>
          <Text style={assessmentStyles.heading}>Changed factors</Text>
          {changes.length ? changes.map((change) => <AssessmentDetail key={change.key} label={change.label}
            value={change.numericDelta === null ? `${String(change.previousValue)} → ${String(change.nextValue)}`
              : `${String(change.previousValue)} → ${String(change.nextValue)} (${change.numericDelta > 0 ? '+' : ''}${change.numericDelta})`} />)
            : <Text style={assessmentStyles.body}>No factor values have changed.</Text>}
          {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
          <AssessmentButton label={busy ? 'Calculating…' : 'CALCULATE NEW RISK'} disabled={busy || !factorSnapshot || Boolean(reasonError)} onPress={() => void calculate()} />
          <AssessmentButton label="Edit situation" secondary onPress={() => go('situation')} />
        </View> : null}
        {step === 'comparison' && preview ? <View style={assessmentStyles.card}>
          <Text style={assessmentStyles.heading}>Risk comparison</Text>
          <AssessmentDetail label="Previous officer decision" value={matchingDraft.previousAssessment?.finalRiskLevel ?? 'Unavailable'} />
          <AssessmentDetail label="New system recommendation" value={preview.result.systemSuggestedRisk} />
          <AssessmentDetail label="New calculated score" value={preview.result.calculatedScore} />
          <Text style={assessmentStyles.helper}>{matchingDraft.previousAssessment?.finalRiskLevel === preview.result.systemSuggestedRisk
            ? 'The recommendation level is unchanged.' : 'The recommendation level changed.'}</Text>
          <Text style={assessmentStyles.helper}>The comparison describes the two assessments and does not attribute the change to individual factors.</Text>
          <AssessmentButton label="CONTINUE TO DECISION" onPress={() => go('decision')} />
          <AssessmentButton label="Edit factors" secondary onPress={() => go('review')} />
        </View> : null}
        {step === 'decision' && preview ? <RiskDecisionScreen factors={preview.factors} calculation={preview.result}
          finalRisk={matchingDraft.finalRiskLevel} reason={matchingDraft.decisionReason} saving={busy}
          onFinalRisk={setFinalRisk} onReason={setDecisionReason} onEdit={() => go('review')} onSave={() => void save()}
          previousAssessment={matchingDraft.previousAssessment} saveLabel="SAVE REASSESSMENT" /> : null}
        {error && step !== 'review' ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </AssessmentPage>;
}

const styles = StyleSheet.create({ content: { gap: 14, paddingBottom: 24 }, multiline: { minHeight: 100, textAlignVertical: 'top' } });
