import { Text, TextInput, View } from 'react-native';
import {
  RISK_DECISION_REASON_MAX_LENGTH, RISK_LEVELS,
  type CalculateRiskAssessmentResponse, type RiskAssessmentFactors, type RiskLevel
} from '@safealert/contracts';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import {
  AssessmentButton, AssessmentFactorSummary, AssessmentOptions, assessmentStyles
} from '../components/RiskAssessmentComponents';
import { decisionReasonError } from '../riskAssessmentForm';

// This is the second step of the create route; only its parent owns the save operation.
export function RiskDecisionScreen({ factors, calculation, finalRisk, reason, saving, onFinalRisk, onReason, onEdit, onSave }: {
  factors: RiskAssessmentFactors; calculation: CalculateRiskAssessmentResponse;
  finalRisk: RiskLevel; reason: string; saving: boolean;
  onFinalRisk: (value: RiskLevel) => void; onReason: (value: string) => void;
  onEdit: () => void; onSave: () => void;
}) {
  const override = finalRisk !== calculation.systemSuggestedRisk;
  const reasonError = decisionReasonError(finalRisk, calculation.systemSuggestedRisk, reason);
  return <>
    <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.heading}>System suggested risk</Text>
      <PriorityBadge priority={calculation.systemSuggestedRisk} />
      <Text style={assessmentStyles.body}>Calculated Score: {calculation.calculatedScore}</Text>
      <Text style={assessmentStyles.helper}>Select your final risk level below. An override requires a decision reason.</Text>
    </View>
    <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.heading}>Final officer decision</Text>
      <AssessmentOptions label="Final Risk Level" options={RISK_LEVELS} value={finalRisk} onChange={onFinalRisk} disabled={saving} />
      <Text style={assessmentStyles.helper}>Officer selected final risk: {finalRisk}</Text>
      <Text style={assessmentStyles.label}>Decision Reason {override ? '(required)' : '(optional)'}</Text>
      <TextInput accessibilityLabel="Decision Reason" multiline textAlignVertical="top" editable={!saving}
        value={reason} onChangeText={onReason} maxLength={RISK_DECISION_REASON_MAX_LENGTH}
        placeholder="Explain the evidence supporting your decision" style={[assessmentStyles.input, { minHeight: 110 }]} />
      {reasonError ? <Text accessibilityLiveRegion="polite" style={assessmentStyles.error}>{reasonError}</Text> : null}
      <Text style={assessmentStyles.helper}>{reason.trim().length}/{RISK_DECISION_REASON_MAX_LENGTH}</Text>
      <AssessmentButton label={saving ? 'Saving…' : 'SAVE ASSESSMENT'} disabled={saving || Boolean(reasonError)} onPress={onSave} />
      <AssessmentButton label="Edit factors" secondary disabled={saving} onPress={onEdit} />
    </View>
    <AssessmentFactorSummary factors={factors} />
  </>;
}
