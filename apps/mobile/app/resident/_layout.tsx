import { RoleRouteLayout } from '../../src/features/auth/screens/RoleRouteLayout';
import { EmergencyAssistanceDraftProvider } from '../../src/features/dashboards/resident/emergencyAssistanceDraft';
import { ResidentOfflineSync } from '../../src/features/dashboards/resident/ResidentOfflineSync';
import { ReportHazardDraftProvider } from '../../src/features/dashboards/resident/reportDraft';

export default function ResidentLayout() {
  return (
    <ReportHazardDraftProvider>
      <EmergencyAssistanceDraftProvider>
        <ResidentOfflineSync />
        <RoleRouteLayout allowedRole="RESIDENT" />
      </EmergencyAssistanceDraftProvider>
    </ReportHazardDraftProvider>
  );
}
