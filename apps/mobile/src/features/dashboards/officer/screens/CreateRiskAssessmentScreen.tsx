import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  HAZARD_ASSESSMENT_SEVERITIES, INFRASTRUCTURE_IMPACT_LEVELS, ROAD_ACCESSIBILITY_OPTIONS,
  WATER_LEVEL_TRENDS, WEATHER_CONDITIONS, RISK_DECISION_REASON_MAX_LENGTH,
  type RiskLevel
} from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';
import {
  calculateRiskAssessment, createRiskAssessment, getRiskAssessment,
  getRiskAssessmentForIncident, reassessRiskAssessment
} from '../api/riskAssessmentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import {
  AssessmentButton, AssessmentLoadState, AssessmentOptions, AssessmentPage,
  IncidentAssessmentContext, assessmentStyles
} from '../components/RiskAssessmentComponents';
import {
  assessmentErrorMessage, buildReassessmentRiskAssessmentRequest, buildRiskAssessmentRequest,
  initialRiskAssessmentForm, parseRiskAssessmentForm, reassessmentReasonError,
  validateRiskAssessmentForm, type RiskAssessmentForm
} from '../riskAssessmentForm';
import { RiskDecisionScreen } from './RiskDecisionScreen';
import { useRiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraft';

export function CreateRiskAssessmentScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const assessmentDraft = useRiskAssessmentDraft();
  const {
    draft, initializeInitialAssessment, initializeReassessment, updateSingleFactor,
    setCalculationPreview, clearCalculationPreview, calculationPreviewIsValid,
    setFinalRisk, setDecisionReason, setReassessmentReason, resetAssessmentDraft
  } = assessmentDraft;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const params = useLocalSearchParams<{ incidentId?: string | string[]; assessmentId?: string | string[] }>();
  const incidentIdParam = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const reassessmentMode = Boolean(assessmentId);
  const form = draft?.factors ?? initialRiskAssessmentForm;
  const preview = draft?.calculationPreview ?? null;
  const finalRisk = draft?.finalRiskLevel ?? 'LOW';
  const reason = draft?.decisionReason ?? '';
  const reassessmentReason = draft?.reassessmentReason ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Partial<Record<keyof RiskAssessmentForm, boolean>>>({});
  const inFlight = useRef(false);
  const generation = useRef(0);
  const finalRiskRef = useRef<RiskLevel>(finalRisk);
  finalRiskRef.current = finalRisk;

  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (assessmentId) return getRiskAssessment(assessmentId, accessToken);
    if (!incidentIdParam) throw new Error('An incident reference is required.');
    return getRiskAssessmentForIncident(incidentIdParam, accessToken);
  }, [accessToken, assessmentId, incidentIdParam]);
  const resource = useAssessmentResource(load);
  const data = resource.data;
  const currentAssessment = reassessmentMode ? data?.assessment : null;
  const dataMatchesRoute = !assessmentId || currentAssessment?.id === assessmentId;
  const draftMatchesRoute = reassessmentMode
    ? draft?.mode === 'REASSESSMENT' && draft.assessmentId === assessmentId
    : draft?.mode === 'INITIAL' && draft.incidentId === incidentIdParam;
  const incidentId = reassessmentMode ? currentAssessment?.incidentId : draft?.incidentId ?? incidentIdParam;

  useEffect(() => {
    if (assessmentId || !incidentIdParam) return;
    if (draftRef.current?.mode === 'INITIAL' && draftRef.current.incidentId === incidentIdParam) return;
    initializeInitialAssessment(incidentIdParam);
  }, [assessmentId, incidentIdParam, initializeInitialAssessment]);

  useFocusEffect(useCallback(() => {
    generation.current += 1;
    inFlight.current = false;
    setBusy(false);
    if (!assessmentId) {
      setError(null);
      setExistingId(null);
      setTouchedFields({});
      setStaleConflict(false);
    }
    return () => { generation.current += 1; };
  }, [accessToken, assessmentId, incidentIdParam]));

  useEffect(() => {
    if (!assessmentId || !data?.assessment || data.assessment.id !== assessmentId) return;
    if (draftRef.current?.mode === 'REASSESSMENT' && draftRef.current.assessmentId === assessmentId) return;
    initializeReassessment({
      assessmentId, incidentId: data.assessment.incidentId,
      factors: data.assessment, finalRiskLevel: data.assessment.finalRiskLevel
    });
    setExistingId(null);
    setTouchedFields({});
    setError(null);
    setStaleConflict(false);
  }, [assessmentId, data, initializeReassessment]);

  const updateForm = <K extends keyof RiskAssessmentForm>(key: K, value: RiskAssessmentForm[K]) => {
    updateSingleFactor(key, value);
    setTouchedFields((current) => ({ ...current, [key]: true }));
    setError(null);
    setStaleConflict(false);
  };
  const updateFinalRisk = (value: RiskLevel) => {
    finalRiskRef.current = value;
    setFinalRisk(value);
  };
  const showResult = (savedAssessmentId: string) => router.replace({
    pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: savedAssessmentId }
  });
  const showMonitoring = (savedIncidentId: string) => router.replace({
    pathname: '/officer/monitoring/[incidentId]', params: { incidentId: savedIncidentId, notice: 'assessment-saved' }
  });

  const viewLatestAssessment = async () => {
    if (!accessToken || !incidentId || busy) return;
    const current = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const latest = await getRiskAssessmentForIncident(incidentId, accessToken);
      if (generation.current !== current) return;
      if (latest.assessment) {
        setExistingId(latest.assessment.id);
        setStaleConflict(false);
      } else {
        setError('There is no active assessment for this incident. Return to Assessments to refresh the incident list.');
      }
    } catch (failure) {
      if (generation.current === current) setError(assessmentErrorMessage(failure));
    } finally {
      if (generation.current === current) { inFlight.current = false; setBusy(false); }
    }
  };

  const calculate = async () => {
    if (inFlight.current || !draftMatchesRoute || !accessToken || !incidentId || !data ||
      (reassessmentMode && currentAssessment?.status !== 'ACTIVE') ||
      !data.reports.some((report) => report.status === 'VERIFIED')) return;
    const current = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const factors = parseRiskAssessmentForm(form);
      const result = await calculateRiskAssessment({ incidentId, ...factors }, accessToken);
      if (generation.current !== current) return;
      setCalculationPreview(factors, result);
      updateFinalRisk(result.systemSuggestedRisk);
      setDecisionReason('');
    } catch (failure) {
      if (generation.current === current) setError(assessmentErrorMessage(failure));
    } finally {
      if (generation.current === current) { inFlight.current = false; setBusy(false); }
    }
  };

  const formErrors = validateRiskAssessmentForm(form);
  const formValid = Object.keys(formErrors).length === 0;
  const showFieldError = (field: keyof RiskAssessmentForm) => touchedFields[field] || Boolean(error);

  const save = async () => {
    if (inFlight.current || !draftMatchesRoute || !preview || !calculationPreviewIsValid || !draft || !accessToken || !incidentId) return;
    const selectedFinalRisk = finalRiskRef.current;
    if (assessmentId) {
      let reassessmentRequest: ReturnType<typeof buildReassessmentRiskAssessmentRequest>;
      try {
        reassessmentRequest = buildReassessmentRiskAssessmentRequest(
          preview.factors, selectedFinalRisk, preview.result.systemSuggestedRisk, reason, reassessmentReason
        );
      } catch (failure) {
        setError(assessmentErrorMessage(failure));
        return;
      }
      const current = generation.current;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setStaleConflict(false);
      try {
        const result = await reassessRiskAssessment(assessmentId, reassessmentRequest, accessToken);
        if (generation.current === current) {
          resetAssessmentDraft();
          showResult(result.assessment.id);
        }
      } catch (failure) {
        if (generation.current === current) {
          setError(assessmentErrorMessage(failure));
          setStaleConflict(failure instanceof ApiClientError && failure.code === 'ASSESSMENT_NOT_ACTIVE');
        }
      } finally {
        if (generation.current === current) { inFlight.current = false; setBusy(false); }
      }
      return;
    }
    let createRequest: ReturnType<typeof buildRiskAssessmentRequest>;
    try {
      createRequest = buildRiskAssessmentRequest(
        incidentId, preview.factors, selectedFinalRisk, preview.result.systemSuggestedRisk, reason
      );
    } catch (failure) {
      setError(assessmentErrorMessage(failure));
      return;
    }
    const current = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      // Submit factors and decision only; authoritative scoring/audit fields never leave the client.
      const result = await createRiskAssessment(createRequest, accessToken);
      if (generation.current === current) {
        resetAssessmentDraft();
        showMonitoring(result.incident.id);
      }
    } catch (failure) {
      if (generation.current !== current) return;
      setError(assessmentErrorMessage(failure));
      if (failure instanceof ApiClientError && failure.code === 'ACTIVE_ASSESSMENT_EXISTS') {
        try {
          const saved = await getRiskAssessmentForIncident(incidentId, accessToken);
          if (generation.current === current) setExistingId(saved.assessment?.id ?? null);
        } catch (lookupError) {
          if (generation.current === current) setError(assessmentErrorMessage(lookupError));
        }
      }
    } finally {
      if (generation.current === current) { inFlight.current = false; setBusy(false); }
    }
  };

  const reassessmentError = reassessmentReasonError(reassessmentReason);
  const activeAssessmentId = existingId ?? (!reassessmentMode ? data?.assessment?.id ?? null : null);
  const assessmentUnavailable = reassessmentMode && currentAssessment?.status !== 'ACTIVE';
  const incidentIneligible = !data || data.incident.status !== 'ACTIVE' ||
    !data.reports.some((report) => report.status === 'VERIFIED');

  return <AssessmentPage key={preview ? 'decision' : 'factors'} title={preview ? 'Risk Decision' : reassessmentMode ? 'Reassess Risk' : 'Assess Risk'}>
    {!data || !dataMatchesRoute || !draftMatchesRoute ? <AssessmentLoadState loading={resource.loading || Boolean(data) || !draftMatchesRoute} error={resource.error} retry={() => void resource.reload()} /> : <>
      {!preview && !reassessmentMode ? <IncidentAssessmentContext key={data.incident.id} incident={data.incident} reports={data.reports} /> : null}
      {activeAssessmentId ? <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.body}>An active assessment already exists for this incident.</Text>
        <AssessmentButton label="View Risk Assessment" onPress={() => showResult(activeAssessmentId)} />
      </View> : assessmentUnavailable ? <View>
        <Text accessibilityRole="alert" style={assessmentStyles.error}>This assessment is no longer active. View the latest assessment for this incident.</Text>
        {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
        <AssessmentButton label="View latest assessment" disabled={busy} onPress={() => void viewLatestAssessment()} />
      </View> : incidentIneligible ? <Text accessibilityRole="alert" style={assessmentStyles.error}>
        Only active incidents with at least one VERIFIED report can be assessed.
      </Text> : preview ? <>
        {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
        {staleConflict ? <AssessmentButton label="View latest assessment" disabled={busy} onPress={() => void viewLatestAssessment()} /> : null}
        <Text style={assessmentStyles.helper}>{reassessmentMode
          ? 'The current assessment remains active until the replacement is saved.'
          : 'Calculation preview only. This Incident remains Not assessed until you save the assessment.'}</Text>
        <RiskDecisionScreen factors={preview.factors} calculation={preview.result} finalRisk={finalRisk}
          reason={reason} saving={busy} onFinalRisk={updateFinalRisk} onReason={setDecisionReason}
          onEdit={() => { clearCalculationPreview(); setError(null); }} onSave={() => void save()}
          previousAssessment={reassessmentMode && currentAssessment?.status === 'ACTIVE' ? currentAssessment : undefined}
          saveLabel={reassessmentMode ? 'SAVE REASSESSMENT' : 'SAVE ASSESSMENT'} />
        <IncidentAssessmentContext incident={data.incident} reports={data.reports} />
      </> : <View style={assessmentStyles.card}>
        {reassessmentMode && currentAssessment ? <>
          <Text style={assessmentStyles.heading}>Current Assessment</Text>
          <Text style={assessmentStyles.body}>Risk: {currentAssessment.finalRiskLevel}</Text>
          <Text style={assessmentStyles.body}>Score: {currentAssessment.calculatedScore}</Text>
          <Text style={assessmentStyles.helper}>Assessed: {new Date(currentAssessment.assessedAt).toLocaleString()}</Text>
          <Text style={assessmentStyles.label}>Reason for Reassessment *</Text>
          <TextInput accessibilityLabel="Reason for Reassessment" multiline textAlignVertical="top" editable={!busy}
            value={reassessmentReason} onChangeText={(value) => { setReassessmentReason(value); setError(null); }}
            maxLength={RISK_DECISION_REASON_MAX_LENGTH} placeholder="Describe what has changed"
            style={[assessmentStyles.input, { minHeight: 90 }]} />
          {reassessmentError ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{reassessmentError}</Text> : null}
        </> : null}
        <Text style={assessmentStyles.heading}>Officer assessment factors</Text>
        <AssessmentOptions label="Hazard Severity" options={HAZARD_ASSESSMENT_SEVERITIES} value={form.hazardSeverity} onChange={(value) => updateForm('hazardSeverity', value)} disabled={busy} />
        <Text style={assessmentStyles.label}>People Affected</Text>
        <TextInput accessibilityLabel="People Affected" keyboardType="number-pad" editable={!busy} value={form.peopleAffected}
          onChangeText={(value) => updateForm('peopleAffected', value)} style={[assessmentStyles.input, showFieldError('peopleAffected') && formErrors.peopleAffected ? assessmentStyles.inputError : null]} placeholder="Enter total people affected" />
        {showFieldError('peopleAffected') && formErrors.peopleAffected ? <Text style={assessmentStyles.error}>{formErrors.peopleAffected}</Text> : null}
        <Text style={assessmentStyles.label}>Vulnerable People</Text>
        <TextInput accessibilityLabel="Vulnerable People" keyboardType="number-pad" editable={!busy} value={form.vulnerablePeople}
          onChangeText={(value) => updateForm('vulnerablePeople', value)} style={[assessmentStyles.input, showFieldError('vulnerablePeople') && formErrors.vulnerablePeople ? assessmentStyles.inputError : null]} placeholder="Enter vulnerable people affected" />
        {showFieldError('vulnerablePeople') && formErrors.vulnerablePeople ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{formErrors.vulnerablePeople}</Text> : null}
        <AssessmentOptions label="Road Accessibility" options={ROAD_ACCESSIBILITY_OPTIONS} value={form.roadAccessibility} onChange={(value) => updateForm('roadAccessibility', value)} disabled={busy} />
        <AssessmentOptions label="Infrastructure Impact" options={INFRASTRUCTURE_IMPACT_LEVELS} value={form.infrastructureImpact} onChange={(value) => updateForm('infrastructureImpact', value)} disabled={busy} />
        <AssessmentOptions label="Water Level Trend" options={WATER_LEVEL_TRENDS} value={form.waterLevelTrend} onChange={(value) => updateForm('waterLevelTrend', value)} disabled={busy} />
        {data.incident.hazardType !== 'FLOOD' ? <Text style={assessmentStyles.helper}>Water trend is recorded for context; it contributes to scoring only for flood incidents.</Text> : null}
        <AssessmentOptions label="Weather Condition" options={WEATHER_CONDITIONS} value={form.weatherCondition} onChange={(value) => updateForm('weatherCondition', value)} disabled={busy} />
        {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
        {staleConflict ? <AssessmentButton label="View latest assessment" disabled={busy} onPress={() => void viewLatestAssessment()} /> : null}
        {!formValid ? <Text style={assessmentStyles.helper}>Enter valid people counts before calculating risk.</Text> : null}
        {reassessmentMode && reassessmentError ? <Text style={assessmentStyles.helper}>Enter a reassessment reason before calculating risk.</Text> : null}
        <AssessmentButton label={busy ? 'Calculating…' : 'CALCULATE RISK'} disabled={busy || !formValid || (reassessmentMode && Boolean(reassessmentError))} onPress={() => void calculate()} />
      </View>}
    </>}
  </AssessmentPage>;
}
