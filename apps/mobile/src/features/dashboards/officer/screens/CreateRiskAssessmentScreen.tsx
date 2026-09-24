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
import { calculateRiskAssessment, createRiskAssessment, getRiskAssessmentForReport } from '../api/riskAssessmentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import {
  AssessmentButton, AssessmentLoadState, AssessmentOptions, AssessmentPage,
  ReportAssessmentContext, assessmentStyles
} from '../components/RiskAssessmentComponents';
import {
  assessmentErrorMessage, decisionReasonError, initialRiskAssessmentForm, parseRiskAssessmentForm,
  type RiskAssessmentForm
} from '../riskAssessmentForm';
import { RiskDecisionScreen } from './RiskDecisionScreen';

type Preview = { factors: RiskAssessmentFactors; result: CalculateRiskAssessmentResponse };

export function CreateRiskAssessmentScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ hazardReportId?: string | string[] }>();
  const hazardReportId = Array.isArray(params.hazardReportId) ? params.hazardReportId[0] : params.hazardReportId;
  const [form, setForm] = useState<RiskAssessmentForm>(initialRiskAssessmentForm);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [finalRisk, setFinalRisk] = useState<RiskLevel>('LOW');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!hazardReportId) throw new Error('A hazard report reference is required.');
    return getRiskAssessmentForReport(hazardReportId, accessToken);
  }, [accessToken, hazardReportId]);
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
    return () => { generation.current += 1; };
  }, [accessToken, hazardReportId]));

  const updateForm = <K extends keyof RiskAssessmentForm>(key: K, value: RiskAssessmentForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setError(null);
  };
  const showResult = (assessmentId: string) => router.replace({
    pathname: '/officer/assessments/[assessmentId]', params: { assessmentId }
  });

  const calculate = async () => {
    if (inFlight.current || !accessToken || !hazardReportId || resource.data?.report.status !== 'VERIFIED') return;
    const current = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const factors = parseRiskAssessmentForm(form);
      const result = await calculateRiskAssessment({ hazardReportId, ...factors }, accessToken);
      if (generation.current !== current) return;
      setPreview({ factors, result });
      setFinalRisk(result.systemSuggestedRisk);
      setReason('');
    } catch (failure) {
      if (generation.current === current) setError(assessmentErrorMessage(failure));
    } finally {
      if (generation.current === current) { inFlight.current = false; setBusy(false); }
    }
  };

  const save = async () => {
    if (inFlight.current || !preview || !accessToken || !hazardReportId) return;
    const invalidReason = decisionReasonError(finalRisk, preview.result.systemSuggestedRisk, reason);
    if (invalidReason) { setError(invalidReason); return; }
    const current = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      // Submit factors and decision only; authoritative scoring/audit fields never leave the client.
      const result = await createRiskAssessment({
        hazardReportId, ...preview.factors, finalRiskLevel: finalRisk,
        ...(reason.trim() ? { decisionReason: reason.trim() } : {})
      }, accessToken);
      if (generation.current === current) showResult(result.assessment.id);
    } catch (failure) {
      if (generation.current !== current) return;
      setError(assessmentErrorMessage(failure));
      if (failure instanceof ApiClientError && failure.code === 'ACTIVE_ASSESSMENT_EXISTS') {
        // Handles another officer's save, and retry after a successful save whose response was lost.
        try {
          const saved = await getRiskAssessmentForReport(hazardReportId, accessToken);
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
      <ReportAssessmentContext key={data.report.id} report={data.report} />
      {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
      {assessmentId ? <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.body}>An active assessment already exists for this report.</Text>
        <AssessmentButton label="View Risk Assessment" onPress={() => showResult(assessmentId)} />
      </View> : data.report.status !== 'VERIFIED' ? <Text style={assessmentStyles.error}>Only VERIFIED reports can be assessed.</Text>
        : preview ? <RiskDecisionScreen factors={preview.factors} calculation={preview.result} finalRisk={finalRisk}
          reason={reason} saving={busy} onFinalRisk={setFinalRisk} onReason={setReason}
          onEdit={() => { setPreview(null); setError(null); }} onSave={() => void save()} />
          : <View style={assessmentStyles.card}>
            <Text style={assessmentStyles.heading}>Officer assessment factors</Text>
            <AssessmentOptions label="Hazard Severity" options={HAZARD_ASSESSMENT_SEVERITIES} value={form.hazardSeverity} onChange={(value) => updateForm('hazardSeverity', value)} disabled={busy} />
            <Text style={assessmentStyles.label}>People Affected</Text>
            <TextInput accessibilityLabel="People Affected" keyboardType="number-pad" editable={!busy} value={form.peopleAffected}
              onChangeText={(value) => updateForm('peopleAffected', value)} style={assessmentStyles.input} placeholder="Enter total people affected" />
            <Text style={assessmentStyles.label}>Vulnerable People</Text>
            <TextInput accessibilityLabel="Vulnerable People" keyboardType="number-pad" editable={!busy} value={form.vulnerablePeople}
              onChangeText={(value) => updateForm('vulnerablePeople', value)} style={assessmentStyles.input} placeholder="Enter vulnerable people affected" />
            <AssessmentOptions label="Road Accessibility" options={ROAD_ACCESSIBILITY_OPTIONS} value={form.roadAccessibility} onChange={(value) => updateForm('roadAccessibility', value)} disabled={busy} />
            <AssessmentOptions label="Infrastructure Impact" options={INFRASTRUCTURE_IMPACT_LEVELS} value={form.infrastructureImpact} onChange={(value) => updateForm('infrastructureImpact', value)} disabled={busy} />
            <AssessmentOptions label="Water Level Trend" options={WATER_LEVEL_TRENDS} value={form.waterLevelTrend} onChange={(value) => updateForm('waterLevelTrend', value)} disabled={busy} />
            {data.report.hazardType !== 'FLOOD' ? <Text style={assessmentStyles.helper}>Water trend is recorded for context; it contributes to scoring only for flood reports.</Text> : null}
            <AssessmentOptions label="Weather Condition" options={WEATHER_CONDITIONS} value={form.weatherCondition} onChange={(value) => updateForm('weatherCondition', value)} disabled={busy} />
            <AssessmentButton label={busy ? 'Calculating…' : 'CALCULATE RISK'} disabled={busy} onPress={() => void calculate()} />
          </View>}
    </>}
  </AssessmentPage>;
}
