import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IncidentMonitoringDetailResponse } from '@safealert/contracts';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({ data: null as IncidentMonitoringDetailResponse | null, loading: false, error: null as string | null,
  loader: null as (() => Promise<IncidentMonitoringDetailResponse>) | null, get: vi.fn(),
  params: { incidentId: 'incident-1' } as { incidentId: string; notice?: string },
  actions: new Map<string, () => void>(), push: vi.fn(), setParams: vi.fn(), reload: vi.fn(), hooks: [] as unknown[], hookIndex: 0, effects: [] as (() => void)[] }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => {
    const index = state.hookIndex++;
    if (index >= state.hooks.length) state.hooks[index] = initial;
    return [state.hooks[index], (value: unknown) => { state.hooks[index] = value; }];
  }, useEffect: (effect: () => void) => { state.effects.push(effect); } };
});
vi.mock('react-native', () => ({ View: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span> }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push, setParams: state.setParams }), useLocalSearchParams: () => state.params, useFocusEffect: vi.fn() }));
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
beforeEach(() => {
  state.data = null; state.loading = false; state.error = null; state.loader = null; state.get.mockReset();
  state.params = { incidentId: 'incident-1' }; state.actions.clear(); state.push.mockReset(); state.setParams.mockReset();
  state.setParams.mockImplementation((params: { notice?: string }) => { state.params = { ...state.params, ...params }; });
  state.reload.mockReset(); state.hooks = []; state.hookIndex = 0; state.effects = [];
});

function renderDetail() {
  state.hookIndex = 0; state.effects = [];
  const markup = renderToStaticMarkup(<OfficerMonitoringDetailScreen />);
  state.effects.forEach((effect) => effect());
  return markup;
}

it('loads evidence and routes active assessment lifecycle actions to existing screens', async () => {
  const response = detail({ warnings: [{ id: 'warning-1', assessmentId: 'assessment-1', status: 'DRAFT', createdAt: '2026-09-26T12:30:00.000Z' }] });
  state.get.mockResolvedValue(response); renderDetail();
  await expect(state.loader!()).resolves.toEqual(response); state.data = response;
  const markup = renderDetail();
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
  state.actions.get('VIEW WARNING 1')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/warnings/[warningId]', params: { warningId: 'warning-1' } });
});

it('shows the initial-save confirmation notice on monitoring detail', () => {
  state.params = { incidentId: 'incident-1', notice: 'assessment-saved' };
  state.data = null;
  expect(renderDetail()).toContain('Risk assessment saved successfully. This incident is now available in Monitoring.');
  expect(state.setParams).toHaveBeenCalledWith({ notice: undefined });
  state.params = { incidentId: 'incident-1' };
  state.data = detail();
  expect(renderDetail()).toContain('Risk assessment saved successfully. This incident is now available in Monitoring.');
});

it('shows and opens every warning associated with the visible assessment', () => {
  state.data = detail({ warnings: [
    { id: 'warning-1', assessmentId: 'assessment-1', status: 'DRAFT', createdAt: '2026-09-26T12:30:00.000Z' },
    { id: 'warning-2', assessmentId: 'assessment-1', status: 'PUBLISHED', createdAt: '2026-09-26T12:45:00.000Z', publishedAt: '2026-09-26T13:00:00.000Z' }
  ] });
  const markup = renderDetail();
  expect(markup).toContain('Warning 1 status: DRAFT');
  expect(markup).toContain('Warning 2 status: PUBLISHED');
  state.actions.get('VIEW WARNING 2')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/warnings/[warningId]', params: { warningId: 'warning-2' } });
});

it('shows closed and no-visible-assessment states without offering lifecycle mutations', () => {
  state.data = detail({ currentAssessment: null, latestAssessment: { ...active, status: 'CLOSED', closureReason: 'INCIDENT_RESOLVED' }, hasNewVerifiedEvidence: false, newVerifiedReportsSinceAssessment: 0 });
  let markup = renderDetail();
  expect(markup).toContain('CLOSED'); expect(markup).toContain('VIEW HISTORY'); expect(markup).not.toContain('CREATE WARNING');
  state.data = detail({ currentAssessment: null, latestAssessment: null, warnings: [], hasNewVerifiedEvidence: false, newVerifiedReportsSinceAssessment: 0 });
  markup = renderDetail();
  expect(markup).toContain('No active risk assessment'); expect(markup).not.toContain('DELETE ASSESSMENT');
});

it('keeps detail errors retryable and only offers warning creation for eligible active assessments', () => {
  state.error = 'Monitoring unavailable';
  expect(renderDetail()).toContain('Monitoring unavailable');
  state.error = null;
  state.data = detail({ currentAssessment: { ...active, finalRiskLevel: 'MODERATE' }, latestAssessment: { ...active, finalRiskLevel: 'MODERATE' } });
  expect(renderDetail()).not.toContain('CREATE WARNING');
});

it('shows the replacement active risk and zero new evidence after reassessment refresh', () => {
  state.data = detail({ currentAssessment: { ...active, id: 'assessment-replacement', finalRiskLevel: 'CRITICAL' },
    latestAssessment: { ...active, id: 'assessment-replacement', finalRiskLevel: 'CRITICAL' },
    newVerifiedReportsSinceAssessment: 0, hasNewVerifiedEvidence: false });
  const markup = renderDetail();
  expect(markup).toContain('CRITICAL');
  expect(markup).toContain('0 new verified reports');
  expect(markup).not.toContain('NEW VERIFIED EVIDENCE');
  state.actions.get('REASSESS RISK')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/assessments/create', params: { assessmentId: 'assessment-replacement' } });
});
