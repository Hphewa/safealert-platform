import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { GetActiveIncidentsResponse, RiskAssessmentForIncidentResponse } from '@safealert/contracts';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

const state = vi.hoisted(() => ({
  data: null as unknown[] | null,
  loading: false,
  error: null as string | null,
  loader: null as (() => Promise<unknown[]>) | null,
  listIncidents: vi.fn(),
  getAssessment: vi.fn(),
  getHistory: vi.fn(),
  actions: new Map<string, () => void>(),
  push: vi.fn()
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: state.push }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: vi.fn()
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'officer-token' }) }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('../../shared/components/PriorityBadge', () => ({ PriorityBadge: ({ priority }: { priority: string }) => <span>{priority}</span> }));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    state.actions.set(label, onPress);
    return <button>{label}</button>;
  },
  AssessmentLoadState: ({ error }: { error: string | null }) => <span>{error ?? 'Loading'}</span>,
  assessmentLabel: (value: string) => value.replace(/_/g, ' '),
  assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../hooks/useAssessmentResource', () => ({
  useAssessmentResource: (loader: () => Promise<unknown[]>) => {
    state.loader = loader;
    return { data: state.data, loading: state.loading, error: state.error, reload: vi.fn() };
  }
}));
vi.mock('../api/incidentApi', () => ({ listActiveIncidents: state.listIncidents }));
vi.mock('../api/riskAssessmentApi', () => ({ getRiskAssessmentForIncident: state.getAssessment, getRiskAssessmentHistory: state.getHistory }));

import { OfficerRiskAssessmentsScreen } from './OfficerRiskAssessmentsScreen';

const activeIncident: GetActiveIncidentsResponse['incidents'][number] = {
  incident: {
    id: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    reportIds: ['report-1', 'report-2'], status: 'ACTIVE', createdById: 'officer-1',
    createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T11:00:00.000Z'
  },
  reports: [
    { id: 'report-1', residentId: 'resident-1', hazardType: 'FLOOD', description: 'First report evidence', severity: 'HIGH', location: { type: 'Point', coordinates: [79.8612, 6.9271] }, status: 'VERIFIED', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z' },
    { id: 'report-2', residentId: 'resident-2', hazardType: 'FLOOD', description: 'Second report evidence', severity: 'MODERATE', location: { type: 'Point', coordinates: [79.862, 6.928] }, status: 'VERIFIED', createdAt: '2026-09-25T11:00:00.000Z', updatedAt: '2026-09-25T11:00:00.000Z' }
  ]
};

function savedAssessment(): RiskAssessmentForIncidentResponse['assessment'] {
  return {
    id: 'assessment-1', incidentId: 'report-2', hazardSeverity: 'HIGH', peopleAffected: 4,
    vulnerablePeople: 1, roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW',
    waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH',
    calculatedScore: 12, systemSuggestedRisk: 'HIGH', assessedById: 'officer-1', status: 'ACTIVE',
    assessedAt: '2026-09-25T12:00:00.000Z', createdAt: '2026-09-25T12:00:00.000Z', updatedAt: '2026-09-25T12:00:00.000Z'
  };
}

beforeEach(() => {
  state.data = null;
  state.loading = false;
  state.error = null;
  state.loader = null;
  state.actions.clear();
  state.listIncidents.mockReset();
  state.getAssessment.mockReset();
  state.getHistory.mockReset();
  state.push.mockReset();
});

it('loads active incidents and displays one assessment card per incident', async () => {
  state.listIncidents.mockResolvedValue({ incidents: [activeIncident] });
  state.getAssessment.mockResolvedValue({ incident: activeIncident.incident, reports: activeIncident.reports, assessment: null });
  state.getHistory.mockResolvedValue({ incidentId: 'incident-1', assessments: [] });
  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);

  await expect(state.loader!()).resolves.toHaveLength(1);
  expect(state.listIncidents).toHaveBeenCalledWith('officer-token');
  expect(state.getAssessment).toHaveBeenCalledTimes(1);
  expect(state.getHistory).toHaveBeenCalledWith('incident-1', 'officer-token');

  state.data = [{ incident: activeIncident, assessment: null, assessmentReportId: null }];
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('INCIDENT');
  expect(markup).toContain('Verified Reports: 2');
  expect(markup).toContain('ASSESS INCIDENT');
  expect(markup).not.toContain('First report evidence');
  expect(markup).not.toContain('Second report evidence');
});

it('shows the latest historical assessment when the incident has no active assessment', async () => {
  const older = { ...savedAssessment(), id: 'older', status: 'CLOSED' as const, finalRiskLevel: 'MODERATE' as const };
  const latest = { ...savedAssessment(), id: 'latest', status: 'CLOSED' as const, finalRiskLevel: 'CRITICAL' as const };
  state.listIncidents.mockResolvedValue({ incidents: [activeIncident] });
  state.getAssessment.mockResolvedValue({ assessment: null });
  state.getHistory.mockResolvedValue({ incidentId: 'incident-1', assessments: [latest, older] });
  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  state.data = await state.loader!();

  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('CLOSED');
  expect(markup).toContain('CRITICAL');
  expect(markup).toContain('VIEW HISTORY');
  expect(markup).not.toContain('ASSESS INCIDENT');
  expect(markup).not.toContain('Not assessed');
  state.actions.get('VIEW HISTORY')!();
  expect(state.push).toHaveBeenCalledWith({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'latest' } });
});

it('keeps unknown assessment history retryable and suppresses creation', async () => {
  state.listIncidents.mockResolvedValue({ incidents: [activeIncident] });
  state.getAssessment.mockResolvedValue({ assessment: null });
  state.getHistory.mockRejectedValue(new Error('History unavailable'));
  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  state.data = await state.loader!();

  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('History unavailable');
  expect(markup).toContain('Refresh incidents to retry');
  expect(markup).not.toContain('ASSESS INCIDENT');
});

it('routes assessment preparation through the incident', () => {
  state.data = [{ incident: activeIncident, assessment: null }];
  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);

  state.actions.get('ASSESS INCIDENT')!();
  expect(state.push).toHaveBeenCalledWith({
    pathname: '/officer/assessments/create',
    params: { incidentId: 'incident-1' }
  });
});

it('shows VIEW ASSESSMENT when any member report already has an assessment', () => {
  state.data = [{ incident: activeIncident, assessment: savedAssessment() }];
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);

  expect(markup).toContain('VIEW ASSESSMENT');
  expect(markup).not.toContain('ASSESS INCIDENT');
  state.actions.get('VIEW ASSESSMENT')!();
  expect(state.push).toHaveBeenCalledWith({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'assessment-1' } });
});

it('uses the persisted incident assessment returned by the API', async () => {
  const assessment = savedAssessment();
  state.listIncidents.mockResolvedValue({ incidents: [activeIncident] });
  state.getAssessment.mockResolvedValue({ incident: activeIncident.incident, reports: activeIncident.reports, assessment });

  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  const loaded = await state.loader!();
  state.data = loaded;

  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('VIEW ASSESSMENT');
  expect(markup).not.toContain('Not assessed');
  expect(state.getHistory).not.toHaveBeenCalled();
});

it('shows grouping guidance when no active incidents exist', () => {
  state.data = [];
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);

  expect(markup).toContain('No active incidents ready for assessment');
  expect(markup).toContain('Open Incident Grouping');
});

it('keeps saved decisions visible when another incident assessment fails to load', async () => {
  const brokenIncident = { ...activeIncident, incident: { ...activeIncident.incident, id: 'broken-incident' } };
  state.listIncidents.mockResolvedValue({ incidents: [activeIncident, brokenIncident] });
  state.getAssessment.mockResolvedValueOnce({ assessment: savedAssessment() }).mockRejectedValueOnce(new Error('Assessment unavailable'));
  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  state.data = await state.loader!();
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('VIEW ASSESSMENT');
  expect(markup).toContain('Assessment unavailable');
  expect(markup).not.toContain('Not assessed');
  expect(markup).not.toContain('ASSESS INCIDENT');
});

