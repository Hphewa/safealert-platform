import { Stack } from 'expo-router';
import { RiskAssessmentDraftProvider } from '../../../src/features/dashboards/officer/assessment-flow/riskAssessmentDraft';

export default function OfficerAssessmentsLayout() {
  return <RiskAssessmentDraftProvider><Stack screenOptions={{ headerShown: false }} /></RiskAssessmentDraftProvider>;
}
