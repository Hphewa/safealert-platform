import { useCallback, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  HAZARD_ASSESSMENT_SEVERITIES, INFRASTRUCTURE_IMPACT_LEVELS, ROAD_ACCESSIBILITY_OPTIONS,
  WATER_LEVEL_TRENDS, WEATHER_CONDITIONS, type CalculateRiskAssessmentResponse,
  type RiskAssessmentFactors, type RiskLevel
} from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';
import { calculateRiskAssessment, createRiskAssessment, getRiskAssessmentForIncident } from '../api/riskAssessmentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import {
  AssessmentButton, AssessmentLoadState, AssessmentOptions, AssessmentPage,
  IncidentAssessmentContext, assessmentStyles
} from '../components/RiskAssessmentComponents';
import {
  assessmentErrorMessage, buildRiskAssessmentRequest, initialRiskAssessmentForm, parseRiskAssessmentForm,
  validateRiskAssessmentForm,
  type RiskAssessmentForm
} from '../riskAssessmentForm';
import { RiskDecisionScreen } from './RiskDecisionScreen';

type Preview = { factors: RiskAssessmentFactors; result: CalculateRiskAssessmentResponse };

export function CreateRiskAssessmentScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ incidentId?: string | string[] }>();
  const incidentId = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
  const [form, setForm] = useState<RiskAssessmentForm>(initialRiskAssessmentForm);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [finalRisk, setFinalRisk] = useState<RiskLevel>('LOW');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Partial<Record<keyof RiskAssessmentForm, boolean>>>({});
  const inFlight = useRef(false);
  const generation = useRef(0);
  const finalRiskRef = useRef<RiskLevel>('LOW');
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!incidentId) throw new Error('An incident reference is required.');
    return getRiskAssessmentForIncident(incidentId, accessToken);
  }, [accessToken, incidentId]);
  const resource = useAssessmentResource(load);

  useFocusEffect(useCallback(() => {
    generation.current += 1;
    inFlight.current = false;
    setBusy(false);
    setPreview(null);
    setForm(initialRiskAssessmentForm);
    setReason('');
    setError(null);
    setExistingId(null);
    setTouchedFields({});
    finalRiskRef.current = 'LOW';
    return () => { generation.current += 1; };
  }, [accessToken, incidentId]));

  const updateForm = <K extends keyof RiskAssessmentForm>(key: K, value: RiskAssessmentForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setTouchedFields((current) => ({ ...current, [key]: true }));
    setPreview(null);
    setError(null);
  };
  const updateFinalRisk = (value: RiskLevel) => {
    finalRiskRef.current = value;
    setFinalRisk(value);
  };
  const showResult = (assessmentId: string) => router.replace({
    pathname: '/officer/assessments/[assessmentId]', params: { assessmentId }
  });

  const calculate = async () => {
    if (inFlight.current || !accessToken || !incidentId || !resource.data?.reports.some((report) => report.status === 'VERIFIED')) return;
    const current = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const factors = parseRiskAssessmentForm(form);
      const result = await calculateRiskAssessment({ incidentId, ...factors }, accessToken);
      if (generation.current !== current) return;
      setPreview({ factors, result });
      updateFinalRisk(result.systemSuggestedRisk);
      setReason('');
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
    if (inFlight.current || !preview || !accessToken || !incidentId) return;
    const selectedFinalRisk = finalRiskRef.current;
    let request: ReturnType<typeof buildRiskAssessmentRequest>;
    try {
      request = buildRiskAssessmentRequest(
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
      const result = await createRiskAssessment(request, accessToken);
      if (generation.current === current) showResult(result.assessment.id);
    } catch (failure) {
      if (generation.current !== current) return;
      setError(assessmentErrorMessage(failure));
      if (failure instanceof ApiClientError && failure.code === 'ACTIVE_ASSESSMENT_EXISTS') {
        // Handles another officer's save, and retry after a successful save whose response was lost.
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

  const data = resource.data;
  const assessmentId = existingId ?? data?.assessment?.id;
  // Remount the scroll container at each step so the suggested risk is not skipped below the old scroll offset.
  return <AssessmentPage key={preview ? 'decision' : 'factors'} title={preview ? 'Risk Decision' : 'Assess Risk'}>
    {!data ? <AssessmentLoadState loading={resource.loading} error={resource.error} retry={() => void resource.reload()} /> : <>
      {!preview ? <IncidentAssessmentContext key={data.incident.id} incident={data.incident} reports={data.reports} /> : null}
      {assessmentId ? <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.body}>An active assessment already exists for this incident.</Text>
        <AssessmentButton label="View Risk Assessment" onPress={() => showResult(assessmentId)} />
      </View> : data.incident.status !== 'ACTIVE' || !data.reports.some((report) => report.status === 'VERIFIED') ? <Text style={assessmentStyles.error}>Only active incidents with at least one VERIFIED report can be assessed.</Text>
        : preview ? <>
          {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
          <Text style={assessmentStyles.helper}>Calculation preview only. This Incident remains Not assessed until you save the assessment.</Text>
          <RiskDecisionScreen factors={preview.factors} calculation={preview.result} finalRisk={finalRisk}
          reason={reason} saving={busy} onFinalRisk={updateFinalRisk} onReason={setReason}
          onEdit={() => { setPreview(null); setError(null); }} onSave={() => void save()} />
          <IncidentAssessmentContext incident={data.incident} reports={data.reports} />
        </>
          : <View style={assessmentStyles.card}>
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
            {!formValid ? <Text style={assessmentStyles.helper}>Enter valid people counts before calculating risk.</Text> : null}
            <AssessmentButton label={busy ? 'Calculating…' : 'CALCULATE RISK'} disabled={busy || !formValid} onPress={() => void calculate()} />
          </View>}
    </>}
  </AssessmentPage>;
}
