import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  RISK_DECISION_REASON_MAX_LENGTH, RISK_LEVELS,
  type CalculateRiskAssessmentResponse, type RiskLevel
} from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { dashboardTheme } from '../../shared/theme';
import { AssessmentProgress } from '../components/AssessmentProgress';
import { AssessmentFactorFields, infrastructureLabels, roadLabels, waterLabels, weatherLabels } from '../components/AssessmentFactorFields';
import { RiskRecommendation } from '../components/RiskRecommendation';
import {
  AssessmentButton, AssessmentDetail, AssessmentFactorSummary, AssessmentLoadState, AssessmentOptions,
  AssessmentPage, assessmentStyles
} from '../components/RiskAssessmentComponents';
import { loadIncidentOverview } from '../api/incidentOverview';
import { calculateRiskAssessment, createRiskAssessment, getRiskAssessmentForIncident } from '../api/riskAssessmentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { formatAssessmentHazard } from '../assessmentQueuePresentation';
import {
  assessmentErrorMessage, buildRiskAssessmentRequest, decisionReasonError, parseRiskAssessmentForm,
  validateRiskAssessmentForm, type RiskAssessmentForm
} from '../riskAssessmentForm';
import { isCalculationPreviewValid, type RiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraftState';
import { useRiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraft';
import { useAssessmentDraftExitGuard } from '../hooks/useAssessmentDraftExitGuard';
import { isOfficerAssessmentOnline, saveOfficerAssessmentWithOfflineSupport } from '../offline/officerAssessmentQueue';

type WizardStep = 'situation' | 'impact' | 'environment' | 'review' | 'recommendation' | 'decision';
const wizardSteps: WizardStep[] = ['situation', 'impact', 'environment', 'review', 'recommendation', 'decision'];
const stepIndexes: Record<'situation' | 'impact' | 'environment', 1 | 2 | 3> = { situation: 1, impact: 2, environment: 3 };
const routeFor = (step: WizardStep, incidentId: string) => ({
  pathname: '/officer/assessments/wizard/[step]' as const, params: { step, incidentId }
});

export function InitialAssessmentWizardScreen() {
  const params = useLocalSearchParams<{ incidentId?: string | string[]; step?: string | string[] }>();
  const incidentId = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
  const rawStep = Array.isArray(params.step) ? params.step[0] : params.step;
  const step = rawStep as WizardStep;
  const routeStepIsValid = wizardSteps.includes(step);
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { draft, isDirty, discardAssessmentDraft, updateSingleFactor, setCalculationPreview, setFinalRisk, setDecisionReason, resetAssessmentDraft } = useRiskAssessmentDraft();
  const allowNextRemoval = useAssessmentDraftExitGuard(isDirty, discardAssessmentDraft);
  const [attempted, setAttempted] = useState(false);
  const [decisionTouched, setDecisionTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAssessmentId, setActiveAssessmentId] = useState<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!incidentId) throw new Error('An incident reference is required.');
    return loadIncidentOverview(incidentId, accessToken);
  }, [accessToken, incidentId]);
  const resource = useAssessmentResource(load);
  const context = resource.data?.incident.id === incidentId ? resource.data : null;
  const matchingDraft: RiskAssessmentDraft | null = draft?.mode === 'INITIAL' && draft.incidentId === incidentId ? draft : null;
  const factors = matchingDraft?.factors;
  const preview = matchingDraft?.calculationPreview ?? null;
  const previewIsValid = isCalculationPreviewValid(matchingDraft);
  const currentPreview = previewIsValid ? preview : null;
  const errors = factors ? validateRiskAssessmentForm(factors) : {};
  const incidentEligible = context?.canStartInitialAssessment === true;
  const finalRisk = matchingDraft?.finalRiskLevel ?? 'LOW';
  const reason = matchingDraft?.decisionReason ?? '';
  const suggestedRisk = currentPreview?.result.systemSuggestedRisk;
  const reasonError = suggestedRisk ? decisionReasonError(finalRisk, suggestedRisk, reason) : null;

  useEffect(() => {
    setAttempted(false); setDecisionTouched(false); setConfirming(false); setError(null); setActiveAssessmentId(null);
  }, [step, incidentId]);
  useFocusEffect(useCallback(() => {
    generation.current += 1;
    inFlight.current = false;
    setBusy(false);
    return () => { generation.current += 1; };
  }, [step, incidentId, accessToken]));

  const goTo = (next: WizardStep) => {
    if (!incidentId) return;
    setError(null);
    router.push(routeFor(next, incidentId));
  };
  const goToOverview = () => {
    if (!incidentId) { router.replace('/officer/assessments'); return; }
    router.dismissTo({ pathname: '/officer/assessments/incident/[incidentId]', params: { incidentId } });
  };
  const continueFromSituation = () => {
    setAttempted(true);
    if (!factors || Object.keys(errors).length) return;
    goTo('impact');
  };
  const continueFromImpact = () => goTo('environment');
  const continueFromEnvironment = () => {
    setAttempted(true);
    if (!factors || Object.keys(errors).length) { goTo('situation'); return; }
    goTo('review');
  };
  const changeFactor = <K extends keyof RiskAssessmentForm>(field: K, value: RiskAssessmentForm[K]) => {
    updateSingleFactor(field, value);
    setAttempted(false); setError(null);
  };

  const calculate = async () => {
    if (inFlight.current || !incidentId || !accessToken || !matchingDraft || !factors || !incidentEligible) return;
    setAttempted(true);
    if (Object.keys(errors).length) { goTo(errors.peopleAffected || errors.vulnerablePeople ? 'situation' : 'review'); return; }
    const current = generation.current;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const latest = await loadIncidentOverview(incidentId, accessToken);
      if (generation.current !== current) return;
      if (latest.incident.id !== incidentId || !latest.canStartInitialAssessment) {
        setError(latest.assessment ? 'An assessment already exists for this incident. Return to the overview to open it.'
          : 'This incident is no longer eligible for an initial assessment. Return to the overview for the latest status.');
        return;
      }
      const factorSnapshot = parseRiskAssessmentForm(factors);
      const result: CalculateRiskAssessmentResponse = await calculateRiskAssessment({ incidentId, ...factorSnapshot }, accessToken);
      if (generation.current !== current) return;
      setCalculationPreview(factorSnapshot, result);
      setFinalRisk(result.systemSuggestedRisk);
      setDecisionReason('');
      goTo('recommendation');
    } catch (failure) {
      if (generation.current === current) setError(assessmentErrorMessage(failure));
    } finally {
      if (generation.current === current) { inFlight.current = false; setBusy(false); }
    }
  };

  const beginSaveConfirmation = () => {
    setDecisionTouched(true);
    if (!currentPreview || !matchingDraft || !incidentEligible || reasonError) return;
    setConfirming(true);
  };
  const save = async () => {
    if (inFlight.current || !incidentId || !accessToken || !matchingDraft || !currentPreview ||
      !incidentEligible || reasonError) return;
    let request;
    try {
      request = buildRiskAssessmentRequest(incidentId, currentPreview.factors, finalRisk, currentPreview.result.systemSuggestedRisk, reason);
    } catch (failure) {
      setError(assessmentErrorMessage(failure)); setConfirming(false); return;
    }
    const current = generation.current;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (await isOfficerAssessmentOnline()) {
        const latest = await loadIncidentOverview(incidentId, accessToken);
        if (generation.current !== current) return;
        if (latest.incident.id !== incidentId || !latest.canStartInitialAssessment) {
          if (latest.assessment) setActiveAssessmentId(latest.assessment.id);
          throw new Error(latest.assessment
            ? 'An active assessment already exists for this incident. Open it to review the latest decision.'
            : 'This incident is no longer eligible for an initial assessment. Refresh its status before saving.');
        }
      }
      if (!user?.id) throw new Error('Your Officer session is unavailable. Please log in again.');
      const saveResult = await saveOfficerAssessmentWithOfflineSupport({ userId: user.id, accessToken,
        payload: { mode: 'INITIAL', request }, saveOnline: () => createRiskAssessment(request, accessToken) });
      if (saveResult.saved === 'local') {
        resetAssessmentDraft(); allowNextRemoval();
        router.replace('/officer/assessments');
        return;
      }
      const result = saveResult.response;
      if (generation.current === current) {
        resetAssessmentDraft();
        allowNextRemoval();
        router.replace({ pathname: '/officer/monitoring/[incidentId]', params: { incidentId: result.incident.id, notice: 'assessment-saved' } });
      }
    } catch (failure) {
      if (generation.current !== current) return;
      setError(assessmentErrorMessage(failure)); setConfirming(false);
      if (failure instanceof ApiClientError && failure.code === 'ACTIVE_ASSESSMENT_EXISTS') {
        try {
          const latest = await getRiskAssessmentForIncident(incidentId, accessToken);
          if (generation.current === current) setActiveAssessmentId(latest.assessment?.id ?? null);
        } catch (lookupError) {
          if (generation.current === current) setError(assessmentErrorMessage(lookupError));
        }
      }
    } finally {
      if (generation.current === current) { inFlight.current = false; setBusy(false); }
    }
  };

  const title = step === 'situation' ? 'Situation' : step === 'impact' ? 'Impact & Access'
    : step === 'environment' ? 'Environment' : step === 'review' ? 'Review Assessment'
      : step === 'recommendation' ? 'Risk Recommendation' : 'Final Decision';
  const formIsValid = factors !== undefined && Object.keys(errors).length === 0;
  return <AssessmentPage title={title} backToIncidentId={incidentId}>
    <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {!routeStepIsValid || !incidentId ? <View style={assessmentStyles.card}>
        <Text accessibilityRole="alert" style={assessmentStyles.error}>This assessment step is unavailable. Return to the incident overview.</Text>
        <AssessmentButton label="Incident Overview" onPress={goToOverview} />
      </View> : !matchingDraft ? <View style={assessmentStyles.card}>
        <Text accessibilityRole="alert" style={assessmentStyles.error}>This assessment draft is no longer available. Return to the incident overview and start again.</Text>
        <AssessmentButton label="Incident Overview" onPress={goToOverview} />
      </View> : !context && resource.error ? <AssessmentLoadState loading={resource.loading} error={resource.error} retry={() => void resource.reload()} />
        : !context || resource.loading ? <AssessmentLoadState loading error={null} retry={() => void resource.reload()} />
          : !incidentEligible ? <View style={assessmentStyles.card}>
            <Text accessibilityRole="alert" style={assessmentStyles.error}>{context.assessment
              ? 'An assessment already exists for this incident. Return to the overview to open it.'
              : 'This incident is no longer eligible for an initial assessment. Return to the overview for the latest status.'}</Text>
            <AssessmentButton label="Incident Overview" onPress={goToOverview} />
          </View> : factors ? <>
            <View style={styles.context}>
              <Text style={assessmentStyles.heading}>{formatAssessmentHazard(context.incident.hazardType)} Incident</Text>
              <HumanReadableLocation location={context.incident.location} style={styles.location} />
              <AssessmentButton label="View Incident Evidence" secondary onPress={goToOverview} />
            </View>
            {step === 'situation' || step === 'impact' || step === 'environment'
              ? <AssessmentProgress step={stepIndexes[step]} /> : null}
            {step === 'situation' ? <AssessmentFactorFields section="situation" factors={factors}
              hazardType={context.incident.hazardType} errors={errors} showErrors={attempted}
              onChange={changeFactor} onContinue={continueFromSituation} /> : null}
            {step === 'impact' ? <AssessmentFactorFields section="impact" factors={factors}
              hazardType={context.incident.hazardType} onChange={changeFactor}
              onBack={() => goTo('situation')} onContinue={continueFromImpact} /> : null}
            {step === 'environment' ? <AssessmentFactorFields section="environment" factors={factors}
              hazardType={context.incident.hazardType} onChange={changeFactor}
              onBack={() => goTo('impact')} onContinue={continueFromEnvironment} continueLabel="REVIEW ASSESSMENT" /> : null}
            {step === 'review' ? <>
              <View style={assessmentStyles.card}>
                <Text style={assessmentStyles.heading}>Situation</Text>
                <AssessmentDetail label="Hazard Severity" value={factors.hazardSeverity} />
                <AssessmentDetail label="People Affected" value={factors.peopleAffected || 'Not entered'} />
                <AssessmentDetail label="Vulnerable People" value={factors.vulnerablePeople || 'Not entered'} />
                <AssessmentButton label="Edit Situation" secondary onPress={() => goTo('situation')} />
              </View>
              <View style={assessmentStyles.card}>
                <Text style={assessmentStyles.heading}>Impact & Access</Text>
                <AssessmentDetail label="Road Accessibility" value={roadLabels[factors.roadAccessibility]} />
                <AssessmentDetail label="Infrastructure Impact" value={infrastructureLabels[factors.infrastructureImpact]} />
                <AssessmentButton label="Edit Impact & Access" secondary onPress={() => goTo('impact')} />
              </View>
              <View style={assessmentStyles.card}>
                <Text style={assessmentStyles.heading}>Environment</Text>
                <AssessmentDetail label="Water Level Trend" value={waterLabels[factors.waterLevelTrend]} />
                <AssessmentDetail label="Weather Condition" value={weatherLabels[factors.weatherCondition]} />
                <AssessmentButton label="Edit Environment" secondary onPress={() => goTo('environment')} />
              </View>
              {!formIsValid ? <Text accessibilityRole="alert" style={assessmentStyles.error}>Complete the required people counts before continuing.</Text> : null}
              {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
              <AssessmentButton label={busy ? 'Calculating…' : 'CALCULATE RISK'} disabled={busy} onPress={() => void calculate()} />
              {activeAssessmentId ? <AssessmentButton label="View Risk Assessment" secondary onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: activeAssessmentId } })} /> : null}
            </> : null}
            {step === 'recommendation' ? currentPreview && suggestedRisk ? <>
              <RiskRecommendation risk={suggestedRisk} score={currentPreview.result.calculatedScore}
                factorContributions={currentPreview.result.factorContributions} calculationVersion={currentPreview.result.calculationVersion} />
              <AssessmentFactorSummary factors={currentPreview.factors} />
              <Text style={assessmentStyles.helper}>This recommendation supports officer decision-making. The final risk level must be confirmed by the officer.</Text>
              {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
              <AssessmentButton label="Edit Factors" secondary onPress={() => goTo('review')} />
              <AssessmentButton label="CONTINUE TO DECISION" onPress={() => goTo('decision')} />
            </> : <View style={assessmentStyles.card}>
              <Text accessibilityRole="alert" style={assessmentStyles.error}>The calculation preview is no longer valid. Calculate a new recommendation.</Text>
              <AssessmentButton label="Calculate a new recommendation" onPress={() => goTo('review')} />
            </View> : null}
            {step === 'decision' ? currentPreview && suggestedRisk ? <>
              <RiskRecommendation risk={suggestedRisk} score={currentPreview.result.calculatedScore} />
              <Text style={assessmentStyles.heading}>Officer's Final Risk Level</Text>
              <AssessmentOptions label="Final Risk Level" options={RISK_LEVELS} value={finalRisk}
                onChange={(value: RiskLevel) => { setFinalRisk(value); setDecisionTouched(true); setConfirming(false); }} disabled={busy} />
              {finalRisk === suggestedRisk ? <>
                <Text style={assessmentStyles.label}>Officer Notes (optional)</Text>
                <TextInput accessibilityLabel="Officer Notes (optional)" multiline textAlignVertical="top" editable={!busy}
                  value={reason} onChangeText={(value) => { setDecisionReason(value); setDecisionTouched(true); }}
                  maxLength={RISK_DECISION_REASON_MAX_LENGTH} placeholder="Add relevant observations..."
                  style={[assessmentStyles.input, { minHeight: 90 }]} />
              </> : <>
                <Text style={assessmentStyles.helper}>You are overriding the system recommendation.</Text>
                <Text style={assessmentStyles.label}>Reason for Override *</Text>
                <TextInput accessibilityLabel="Reason for Override" multiline textAlignVertical="top" editable={!busy}
                  value={reason} onChangeText={(value) => { setDecisionReason(value); setDecisionTouched(true); setConfirming(false); }}
                  maxLength={RISK_DECISION_REASON_MAX_LENGTH} placeholder="Explain why this risk level is more appropriate..."
                  style={[assessmentStyles.input, { minHeight: 90 }]} />
                <Text style={assessmentStyles.helper}>Minimum 10 characters</Text>
              </>}
              {decisionTouched && reasonError ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{reasonError}</Text> : null}
              {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
              {activeAssessmentId ? <AssessmentButton label="View Risk Assessment" secondary disabled={busy} onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: activeAssessmentId } })} /> : null}
              {confirming ? <View style={assessmentStyles.card}>
                <Text style={assessmentStyles.heading}>Save Assessment?</Text>
                <AssessmentDetail label="Final Risk" value={finalRisk} />
                <Text style={assessmentStyles.body}>After saving, this incident will be available in Monitoring.</Text>
                <AssessmentButton label="Cancel" secondary disabled={busy} onPress={() => setConfirming(false)} />
                <AssessmentButton label={busy ? 'Saving assessment…' : 'Confirm & Save'} disabled={busy} onPress={() => void save()} />
              </View> : <AssessmentButton label="SAVE ASSESSMENT" disabled={busy || Boolean(reasonError)} onPress={beginSaveConfirmation} />}
              <AssessmentButton label="Edit Factors" secondary disabled={busy} onPress={() => goTo('review')} />
            </> : <View style={assessmentStyles.card}>
              <Text accessibilityRole="alert" style={assessmentStyles.error}>The calculation preview is no longer valid. Calculate a new recommendation before saving.</Text>
              <AssessmentButton label="Calculate a new recommendation" onPress={() => goTo('review')} />
            </View> : null}
          </> : null}
    </KeyboardAvoidingView>
  </AssessmentPage>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  context: { gap: 8, paddingBottom: 4 },
  location: { color: dashboardTheme.colors.text, fontSize: 16, lineHeight: 22 },
  field: { gap: 7 },
  optionHelp: { gap: 4 },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' }
});
