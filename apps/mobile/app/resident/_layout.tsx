import { RoleRouteLayout } from '../../src/features/auth/screens/RoleRouteLayout';
import { EmergencyAssistanceDraftProvider } from '../../src/features/dashboards/resident/emergencyAssistanceDraft';
import { ReportHazardDraftProvider } from '../../src/features/dashboards/resident/reportDraft';

export default function ResidentLayout() {
  return (
    <ReportHazardDraftProvider>
      <EmergencyAssistanceDraftProvider>
        <RoleRouteLayout allowedRole="RESIDENT" />
      </EmergencyAssistanceDraftProvider>
    </ReportHazardDraftProvider>
  );
}
