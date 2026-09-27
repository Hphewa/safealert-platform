import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IncidentMonitoringDetailResponse } from '@safealert/contracts';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({ data: null as IncidentMonitoringDetailResponse | null, loading: false, error: null as string | null,
  loader: null as (() => Promise<IncidentMonitoringDetailResponse>) | null, get: vi.fn(), params: { incidentId: 'incident-1' },
  actions: new Map<string, () => void>(), push: vi.fn(), reload: vi.fn() }));
vi.mock('react-native', () => ({ View: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span> }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }), useLocalSearchParams: () => state.params, useFocusEffect: vi.fn() }));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'officer-token' }) }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('../../shared/components/PriorityBadge', () => ({ PriorityBadge: ({ priority }: { priority: string }) => <span>{priority}</span> }));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress }: { label: string; onPress: () => void }) => { state.actions.set(label, onPress); return <button>{label}</button>; },
  AssessmentLoadState: ({ loading, error }: { loading: boolean; error: string | null }) => <span>{loading ? 'Loading' : error}</span>,
  assessmentLabel: (value: string) => value.replace(/_/g, ' '), assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../hooks/useAssessmentResource', () => ({ useAssessmentResource: (loader: () => Promise<IncidentMonitoringDetailResponse>) => {
  state.loader = loader; return { data: state.data, loading: state.loading, error: state.error, reload: state.reload };
} }));
vi.mock('../api/incidentApi', () => ({ getIncidentMonitoringDetail: state.get }));
import { OfficerMonitoringDetailScreen } from './OfficerMonitoringDetailScreen';

const incident = { id: 'incident-1', hazardType: 'FLOOD' as const, location: { type: 'Point' as const, coordinates: [80, 7] as [number, number] },
  reportIds: ['report-1'], status: 'ACTIVE' as const, createdById: 'officer', createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T10:00:00.000Z' };
const active = { id: 'assessment-1', finalRiskLevel: 'HIGH' as const, calculatedScore: 18, status: 'ACTIVE' as const, assessedAt: '2026-09-26T12:00:00.000Z' };
function detail(overrides: Partial<IncidentMonitoringDetailResponse['monitoring']> = {}): IncidentMonitoringDetailResponse {
  return { monitoring: { incident, currentAssessment: active, latestAssessment: active, totalVerifiedReports: 2,
    newVerifiedReportsSinceAssessment: 1, latestVerifiedReportAt: '2026-09-26T13:00:00.000Z', hasNewVerifiedEvidence: true, warnings: [], ...overrides },
    recentVerifiedReports: [{ id: 'report-1', description: 'Road is flooded', severity: 'HIGH', verifiedAt: '2026-09-26T13:00:00.000Z' }] };
}
beforeEach(() => { state.data = null; state.loading = false; state.error = null; state.loader = null; state.get.mockReset(); state.params = { incidentId: 'incident-1' }; state.actions.clear(); state.push.mockReset(); state.reload.mockReset(); });

it('loads evidence and routes active assessment lifecycle actions to existing screens', async () => {
  const response = detail({ warnings: [{ id: 'warning-1', assessmentId: 'assessment-1', status: 'DRAFT', createdAt: '2026-09-26T12:30:00.000Z' }] });
  state.get.mockResolvedValue(response); renderToStaticMarkup(<OfficerMonitoringDetailScreen />);
  await expect(state.loader!()).resolves.toEqual(response); state.data = response;
  const markup = renderToStaticMarkup(<OfficerMonitoringDetailScreen />);
  expect(markup).toContain('Road is flooded'); expect(markup).toContain('DRAFT'); expect(markup).toContain('1 new verified report');
  expect(markup).not.toContain('DELETE ASSESSMENT');
  state.actions.get('VIEW ASSESSMENT')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'assessment-1' } });
  state.actions.get('REASSESS RISK')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/assessments/create', params: { assessmentId: 'assessment-1' } });
  state.actions.get('CLOSE ASSESSMENT')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'assessment-1' } });
  state.actions.get('CREATE WARNING')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/warnings/create', params: { assessmentId: 'assessment-1' } });
  state.actions.get('VIEW WARNING')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/warnings/[warningId]', params: { warningId: 'warning-1' } });
});

it('shows closed and no-visible-assessment states without offering lifecycle mutations', () => {
  state.data = detail({ currentAssessment: null, latestAssessment: { ...active, status: 'CLOSED', closureReason: 'INCIDENT_RESOLVED' }, hasNewVerifiedEvidence: false, newVerifiedReportsSinceAssessment: 0 });
  let markup = renderToStaticMarkup(<OfficerMonitoringDetailScreen />);
  expect(markup).toContain('CLOSED'); expect(markup).toContain('VIEW HISTORY'); expect(markup).not.toContain('CREATE WARNING');
  state.data = detail({ currentAssessment: null, latestAssessment: null, warnings: [], hasNewVerifiedEvidence: false, newVerifiedReportsSinceAssessment: 0 });
  markup = renderToStaticMarkup(<OfficerMonitoringDetailScreen />);
  expect(markup).toContain('No active risk assessment'); expect(markup).not.toContain('DELETE ASSESSMENT');
});

it('keeps detail errors retryable and only offers warning creation for eligible active assessments', () => {
  state.error = 'Monitoring unavailable';
  expect(renderToStaticMarkup(<OfficerMonitoringDetailScreen />)).toContain('Monitoring unavailable');
  state.error = null;
  state.data = detail({ currentAssessment: { ...active, finalRiskLevel: 'MODERATE' }, latestAssessment: { ...active, finalRiskLevel: 'MODERATE' } });
  expect(renderToStaticMarkup(<OfficerMonitoringDetailScreen />)).not.toContain('CREATE WARNING');
});
