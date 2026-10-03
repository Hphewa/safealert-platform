import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IncidentMonitoringDetailResponse, RiskAssessmentHistoryResponse } from '@safealert/contracts';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({ data: null as IncidentMonitoringDetailResponse | null, loading: false, error: null as string | null,
  loader: null as (() => Promise<IncidentMonitoringDetailResponse>) | null, get: vi.fn(), getTimeline: vi.fn(),
  getHistory: vi.fn(),
  params: { incidentId: 'incident-1' } as { incidentId: string; notice?: string },
  actions: new Map<string, () => void>(), push: vi.fn(), setParams: vi.fn(), reload: vi.fn(), refresh: null as (() => void) | null,
  hooks: [] as unknown[], hookIndex: 0, effects: [] as (() => void)[] }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => {
    const index = state.hookIndex++;
    if (index >= state.hooks.length) state.hooks[index] = initial;
    return [state.hooks[index], (value: unknown) => { state.hooks[index] = value; }];
  }, useEffect: (effect: () => void) => { state.effects.push(effect); } };
});
vi.mock('react-native', () => ({ View: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  StyleSheet: { create: (value: unknown) => value },
  RefreshControl: ({ onRefresh }: { onRefresh: () => void }) => { state.refresh = onRefresh; return <button>Pull to refresh</button>; } }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push, setParams: state.setParams }), useLocalSearchParams: () => state.params, useFocusEffect: vi.fn() }));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'officer-token' }) }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children, refreshControl }: { children?: ReactNode; refreshControl?: ReactNode }) => <main>{refreshControl}{children}</main> }));
vi.mock('../../shared/components/PriorityBadge', () => ({ PriorityBadge: ({ priority }: { priority: string }) => <span>{priority}</span> }));
vi.mock('../../shared/components/StatusBadge', () => ({ StatusBadge: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('../../shared/maps/HumanReadableLocation', () => ({ HumanReadableLocation: () => <span>Pannipitiya, Western Province</span> }));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress }: { label: string; onPress: () => void }) => { state.actions.set(label, onPress); return <button>{label}</button>; },
  AssessmentDetail: ({ label, value }: { label: string; value: string | number }) => <div>{label}: {value}</div>,
  AssessmentLoadState: ({ loading, error }: { loading: boolean; error: string | null }) => <span>{loading ? 'Loading' : error}</span>,
  assessmentLabel: (value: string) => value.replace(/_/g, ' '), assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../hooks/useAssessmentResource', () => ({ useAssessmentResource: (loader: () => Promise<IncidentMonitoringDetailResponse>) => {
  state.loader = loader; return { data: state.data, loading: state.loading, error: state.error, reload: state.reload };
} }));
vi.mock('../api/incidentApi', () => ({ getIncidentMonitoringDetail: state.get }));
vi.mock('../api/incidentActivityApi', () => ({ getIncidentActivityTimeline: state.getTimeline }));
vi.mock('../api/riskAssessmentApi', () => ({ getRiskAssessmentHistory: state.getHistory }));
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
  state.getTimeline.mockReset(); state.getTimeline.mockResolvedValue({ incidentId: 'incident-1', events: [] });
  state.params = { incidentId: 'incident-1' }; state.actions.clear(); state.push.mockReset(); state.setParams.mockReset();
  state.setParams.mockImplementation((params: { notice?: string }) => { state.params = { ...state.params, ...params }; });
  state.getHistory.mockReset(); state.getHistory.mockResolvedValue({ incidentId: 'incident-1', assessments: [active] } as unknown as RiskAssessmentHistoryResponse);
  state.reload.mockReset(); state.refresh = null; state.hooks = []; state.hookIndex = 0; state.effects = [];
});

function renderDetail() {
  state.hookIndex = 0; state.effects = [];
  const markup = renderToStaticMarkup(<OfficerMonitoringDetailScreen />);
  state.effects.forEach((effect) => effect());
  return markup;
}

it('loads evidence and routes active assessment lifecycle actions to existing screens', async () => {
  state.get.mockResolvedValue(detail()); renderDetail();
  await expect(state.loader!()).resolves.toEqual(detail()); state.data = detail();
  const markup = renderDetail();
  expect(markup).toContain('Road is flooded'); expect(markup).toContain('DRAFT'); expect(markup).toContain('1 verified report was added');
  expect(markup).toContain('New information may affect the current risk decision');
  expect(markup).toContain('CURRENT RISK'); expect(markup).toContain('Risk score 18'); expect(markup).toContain('Pannipitiya, Western Province');
  expect(markup).toContain('Incident Activity');
  expect(markup).not.toContain('assessment-1');
  expect(markup).not.toContain('incident-1');
  expect(markup).not.toContain('DELETE ASSESSMENT');
  expect(markup).not.toContain('CREATE WARNING');
  state.actions.get('VIEW ASSESSMENT')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'assessment-1' } });
  state.actions.get('REASSESS RISK')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/assessments/reassess/[step]', params: { assessmentId: 'assessment-1', step: 'reason' } });
  state.actions.get('Close Assessment')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'assessment-1' } });
});

it('shows the initial-save confirmation notice on monitoring detail', () => {
  vi.useFakeTimers();
  state.params = { incidentId: 'incident-1', notice: 'assessment-saved' };
  state.data = null;
  expect(renderDetail()).toContain('Assessment saved');
  expect(state.setParams).toHaveBeenCalledWith({ notice: undefined });
  state.params = { incidentId: 'incident-1' };
  state.data = detail();
  vi.advanceTimersByTime(5000);
  expect(renderDetail()).not.toContain('Assessment saved');
  vi.useRealTimers();
});

it('shows closed and no-visible-assessment states without offering lifecycle mutations', () => {
  state.data = detail({ currentAssessment: null, latestAssessment: { ...active, status: 'CLOSED', closureReason: 'INCIDENT_RESOLVED' }, hasNewVerifiedEvidence: false, newVerifiedReportsSinceAssessment: 0 });
  renderDetail(); await Promise.resolve(); await Promise.resolve();
  let markup = renderDetail();
  expect(markup).toContain('CLOSED'); expect(markup).toContain('VIEW HISTORY');
  state.data = detail({ currentAssessment: null, latestAssessment: null, warnings: [], hasNewVerifiedEvidence: false, newVerifiedReportsSinceAssessment: 0 });
  markup = renderDetail();
  expect(markup).toContain('No current risk assessment'); expect(markup).not.toContain('CURRENT RISK'); expect(markup).not.toContain('DELETE ASSESSMENT');
});

it('keeps detail errors retryable', () => {
  state.error = 'Monitoring unavailable';
  expect(renderDetail()).toContain('Monitoring unavailable');
});

it('shows the replacement active risk and zero new evidence after reassessment refresh', () => {
  state.data = detail({ currentAssessment: { ...active, id: 'assessment-replacement', finalRiskLevel: 'CRITICAL' },
    latestAssessment: { ...active, id: 'assessment-replacement', finalRiskLevel: 'CRITICAL' },
    newVerifiedReportsSinceAssessment: 0, hasNewVerifiedEvidence: false });
  const markup = renderDetail();
  expect(markup).toContain('CRITICAL');
  expect(markup).toContain('No new verified evidence since assessment');
  expect(markup).not.toContain('NEW VERIFIED EVIDENCE');
  state.actions.get('REASSESS RISK')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/assessments/reassess/[step]', params: { assessmentId: 'assessment-replacement', step: 'reason' } });
});

it('recommends creating a draft warning only for an eligible active HIGH assessment with no warning', () => {
  state.data = detail({ warnings: [] });
  const markup = renderDetail();
  expect(markup).toContain('Recommended Action');
  expect(markup).toContain('Consider issuing a public warning for this incident.');
  state.actions.get('CREATE WARNING')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/warnings/create', params: { assessmentId: 'assessment-1' } });
  state.data = detail({ currentAssessment: { ...active, finalRiskLevel: 'LOW' }, latestAssessment: { ...active, finalRiskLevel: 'LOW' }, warnings: [] });
  expect(renderDetail()).not.toContain('Recommended Action');
});

it('loads assessment history and shows current/previous entries without exposing assessment IDs', async () => {
  const previous = { ...active, id: 'assessment-previous', finalRiskLevel: 'MODERATE' as const, assessedAt: '2026-09-26T11:00:00.000Z' };
  state.data = detail();
  state.getHistory.mockResolvedValue({ incidentId: 'incident-1', assessments: [previous, active] } as unknown as RiskAssessmentHistoryResponse);
  renderDetail(); await Promise.resolve(); await Promise.resolve();
  const markup = renderDetail();
  expect(state.getHistory).toHaveBeenCalledWith('incident-1', 'officer-token');
  expect(markup).toContain('Assessment History'); expect(markup).toContain('Current'); expect(markup).toContain('Previous');
  expect(markup).not.toContain('assessment-previous'); expect(markup).not.toContain('assessment-1');
  state.actions.get('View previous assessment')!();
  expect(state.push).toHaveBeenLastCalledWith({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'assessment-previous' } });
});

it('refreshes both monitoring detail and existing assessment history from pull-to-refresh', async () => {
  state.data = detail();
  renderDetail();
  state.reload.mockClear(); state.getHistory.mockClear();
  state.refresh!(); await Promise.resolve(); await Promise.resolve();
  expect(state.reload).toHaveBeenCalledOnce();
  expect(state.getHistory).toHaveBeenCalledOnce();
});
