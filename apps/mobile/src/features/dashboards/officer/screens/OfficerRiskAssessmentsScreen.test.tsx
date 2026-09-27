import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { InitialAssessmentQueueResponse } from '@safealert/contracts';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
const state = vi.hoisted(() => ({
  data: null as InitialAssessmentQueueResponse['incidents'] | null,
  loading: false,
  error: null as string | null,
  loader: null as (() => Promise<InitialAssessmentQueueResponse['incidents']>) | null,
  listQueue: vi.fn(), actions: new Map<string, () => void>(), push: vi.fn()
}));
vi.mock('react-native', () => ({ View: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span> }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }), useLocalSearchParams: () => ({}), useFocusEffect: vi.fn() }));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'officer-token' }) }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('../../shared/components/PriorityBadge', () => ({ PriorityBadge: ({ priority }: { priority: string }) => <span>{priority}</span> }));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress }: { label: string; onPress: () => void }) => { state.actions.set(label, onPress); return <button>{label}</button>; },
  AssessmentLoadState: ({ error }: { error: string | null }) => <span>{error ?? 'Loading'}</span>,
  assessmentLabel: (value: string) => value.replace(/_/g, ' '), assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../hooks/useAssessmentResource', () => ({ useAssessmentResource: (loader: () => Promise<InitialAssessmentQueueResponse['incidents']>) => {
  state.loader = loader; return { data: state.data, loading: state.loading, error: state.error, reload: vi.fn() };
} }));
vi.mock('../api/incidentApi', () => ({ listInitialAssessmentQueue: state.listQueue }));
vi.mock('../api/riskAssessmentApi', () => ({ getRiskAssessmentForIncident: vi.fn(), getRiskAssessmentHistory: vi.fn() }));

import { OfficerRiskAssessmentsScreen } from './OfficerRiskAssessmentsScreen';

const eligible: InitialAssessmentQueueResponse['incidents'][number] = {
  incident: { id: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    reportIds: ['report-1'], status: 'ACTIVE', createdById: 'officer-1', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T11:00:00.000Z' },
  reports: [{ id: 'report-1', residentId: 'resident-1', hazardType: 'FLOOD', description: 'Verified source evidence', severity: 'HIGH',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] }, status: 'VERIFIED', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z' }]
};
beforeEach(() => {
  state.data = null; state.loading = false; state.error = null; state.loader = null; state.actions.clear(); state.listQueue.mockReset(); state.push.mockReset();
});

it('loads one queue endpoint and shows only the initial assessment action', async () => {
  state.listQueue.mockResolvedValue({ incidents: [eligible] });
  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  await expect(state.loader!()).resolves.toEqual([eligible]);
  expect(state.listQueue).toHaveBeenCalledWith('officer-token');
  state.data = [eligible];
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('ASSESS RISK');
  expect(markup).not.toMatch(/VIEW ASSESSMENT|VIEW HISTORY|REASSESS|CLOSE|DELETE/);
  state.actions.get('ASSESS RISK')!();
  expect(state.push).toHaveBeenCalledWith({ pathname: '/officer/assessments/create', params: { incidentId: 'incident-1' } });
});

it('shows the exact initial-queue empty state and preserves load errors', () => {
  state.data = [];
  expect(renderToStaticMarkup(<OfficerRiskAssessmentsScreen />)).toContain('No incidents currently require an initial risk assessment.');
  state.error = 'Queue unavailable';
  expect(renderToStaticMarkup(<OfficerRiskAssessmentsScreen />)).toContain('Queue unavailable');
});
