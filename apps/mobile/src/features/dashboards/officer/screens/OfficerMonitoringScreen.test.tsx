import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IncidentMonitoringSummary } from '@safealert/contracts';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({ data: null as IncidentMonitoringSummary[] | null, loading: false, error: null as string | null,
  loader: null as (() => Promise<IncidentMonitoringSummary[]>) | null, list: vi.fn(), actions: new Map<string, () => void>(), push: vi.fn(), reload: vi.fn(), refresh: null as (() => void) | null }));
vi.mock('react-native', () => ({ View: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  StyleSheet: { create: (value: unknown) => value },
  RefreshControl: ({ onRefresh }: { onRefresh: () => void }) => { state.refresh = onRefresh; return <button>Pull to refresh</button>; } }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }), useFocusEffect: vi.fn() }));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'officer-token' }) }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children, refreshControl }: { children?: ReactNode; refreshControl?: ReactNode }) => <main>{refreshControl}{children}</main> }));
vi.mock('../../shared/components/PriorityBadge', () => ({ PriorityBadge: ({ priority }: { priority: string }) => <span>{priority}</span> }));
vi.mock('../../shared/components/StatusBadge', () => ({ StatusBadge: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('../../shared/maps/HumanReadableLocation', () => ({ HumanReadableLocation: () => <span>Pannipitiya, Western Province</span> }));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress }: { label: string; onPress: () => void }) => { state.actions.set(label, onPress); return <button>{label}</button>; },
  AssessmentLoadState: ({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) => <span>{loading ? 'Loading' : error ?? ''}<button onClick={retry}>Retry</button></span>,
  assessmentLabel: (value: string) => value.replace(/_/g, ' '), assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../hooks/useAssessmentResource', () => ({ useAssessmentResource: (loader: () => Promise<IncidentMonitoringSummary[]>) => {
  state.loader = loader; return { data: state.data, loading: state.loading, error: state.error, reload: state.reload };
} }));
vi.mock('../api/incidentApi', () => ({ listIncidentMonitoring: state.list }));
import { OfficerMonitoringScreen } from './OfficerMonitoringScreen';

function summary(status: 'ACTIVE' | 'CLOSED', id: string): IncidentMonitoringSummary {
  const assessment = { id: `assessment-${id}`, finalRiskLevel: 'HIGH' as const, calculatedScore: 18,
    status, assessedAt: '2026-09-26T12:00:00.000Z', ...(status === 'CLOSED' ? { closureReason: 'INCIDENT_RESOLVED' as const } : {}) };
  return { incident: { id, hazardType: 'FLOOD', location: { type: 'Point', coordinates: [80, 7] }, reportIds: [],
    status: status === 'ACTIVE' ? 'ACTIVE' : 'CLOSED', createdById: 'officer', createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T10:00:00.000Z' },
    currentAssessment: status === 'ACTIVE' ? assessment : null, latestAssessment: assessment,
    totalVerifiedReports: 3, newVerifiedReportsSinceAssessment: status === 'ACTIVE' ? 2 : 0,
    latestVerifiedReportAt: '2026-09-26T13:00:00.000Z', hasNewVerifiedEvidence: status === 'ACTIVE', warnings: [] };
}
beforeEach(() => { state.data = null; state.loading = false; state.error = null; state.loader = null; state.list.mockReset(); state.actions.clear(); state.push.mockReset(); state.reload.mockReset(); state.refresh = null; });

it('loads monitoring and displays active and closed summaries, evidence count, and detail navigation', async () => {
  const active = summary('ACTIVE', 'incident-active'); const closed = summary('CLOSED', 'incident-closed');
  state.list.mockResolvedValue({ incidents: [active, closed] });
  renderToStaticMarkup(<OfficerMonitoringScreen />);
  await expect(state.loader!()).resolves.toEqual([active, closed]);
  state.data = [active, closed];
  const markup = renderToStaticMarkup(<OfficerMonitoringScreen />);
  expect(markup).toContain('ACTIVE'); expect(markup).toContain('CLOSED'); expect(markup).toContain('2 new verified reports');
  expect(markup).toContain('Pannipitiya, Western Province');
  expect(markup).toContain('HIGH'); expect(markup).toContain('Assessment status: ACTIVE');
  expect(markup).not.toContain('80.00000, 7.00000');
  state.actions.get('View Monitoring')!();
  expect(state.push).toHaveBeenCalledWith({ pathname: '/officer/monitoring/[incidentId]', params: { incidentId: 'incident-closed' } });
});

it('supports pull-to-refresh using the existing monitoring reload', async () => {
  state.data = [summary('ACTIVE', 'incident-active')];
  renderToStaticMarkup(<OfficerMonitoringScreen />);
  expect(state.refresh).toBeTypeOf('function');
  state.refresh!();
  await Promise.resolve(); await Promise.resolve();
  expect(state.reload).toHaveBeenCalledOnce();
});

it('shows the empty state and retryable loading errors', () => {
  state.data = [];
  expect(renderToStaticMarkup(<OfficerMonitoringScreen />)).toContain('No assessed incidents are currently available for monitoring.');
  state.error = 'Unable to load monitoring';
  expect(renderToStaticMarkup(<OfficerMonitoringScreen />)).toContain('Unable to load monitoring');
});
