import { RoleRouteLayout } from '../../src/features/auth/screens/RoleRouteLayout';
import { ReportHazardDraftProvider } from '../../src/features/dashboards/resident/reportDraft';

export default function ResidentLayout() {
  return (
    <ReportHazardDraftProvider>
      <RoleRouteLayout allowedRole="RESIDENT" />
    </ReportHazardDraftProvider>
  );
}
