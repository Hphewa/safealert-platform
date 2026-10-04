import { Stack } from 'expo-router';
import { RiskAssessmentDraftProvider } from '../../../src/features/dashboards/officer/assessment-flow/riskAssessmentDraft';
import { OfficerAssessmentOfflineSync } from '../../../src/features/dashboards/officer/offline/OfficerAssessmentOfflineSync';

export default function OfficerAssessmentsLayout() {
  return <RiskAssessmentDraftProvider><OfficerAssessmentOfflineSync /><Stack screenOptions={{ headerShown: false }} /></RiskAssessmentDraftProvider>;
}
