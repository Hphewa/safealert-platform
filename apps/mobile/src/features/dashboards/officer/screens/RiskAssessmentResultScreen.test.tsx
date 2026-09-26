import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskAssessmentHistoryResponse, RiskAssessmentResponse } from '@safealert/contracts';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

const state = vi.hoisted(() => ({
  data: null as unknown,
  loading: false,
  error: null as string | null,
  actions: new Map<string, () => void>(),
  push: vi.fn()
}));

vi.mock('react-native', () => ({
  ActivityIndicator: () => <span>Loading indicator</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: state.push }),
  useLocalSearchParams: () => ({ assessmentId: 'assessment-1' })
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({
  accessToken: 'officer-token', user: { id: 'officer-1', name: 'Officer One' }
}) }));
vi.mock('../../shared/components/PriorityBadge', () => ({
  PriorityBadge: ({ priority }: { priority: string }) => <span>{priority}</span>
}));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    state.actions.set(label, onPress);
    return <button>{label}</button>;
  },
  AssessmentDetail: ({ label, value }: { label: string; value: string | number }) => <span>{label}: {value}</span>,
  AssessmentFactorSummary: () => <div>Assessment factors</div>,
  AssessmentLoadState: () => <div>Assessment loading state</div>,
  AssessmentPage: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
  IncidentAssessmentContext: () => <div>Incident evidence</div>,
  assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../hooks/useAssessmentResource', () => ({
  useAssessmentResource: () => ({ data: state.data, loading: state.loading, error: state.error, reload: vi.fn() })
}));
vi.mock('../api/riskAssessmentApi', () => ({ getRiskAssessment: vi.fn() }));

import { AssessmentHistorySection, RiskAssessmentResultScreen } from './RiskAssessmentResultScreen';

function assessment(status: 'ACTIVE' | 'CLOSED' | 'VOID', overrides: Partial<RiskAssessmentHistoryResponse['assessments'][number]> = {}): RiskAssessmentHistoryResponse['assessments'][number] {
  return {
    id: `assessment-${status.toLowerCase()}`, incidentId: 'incident-1',
    hazardSeverity: 'HIGH', peopleAffected: 4, vulnerablePeople: 1,
    roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING',
    weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH', calculatedScore: 18,
    systemSuggestedRisk: 'HIGH', assessedById: 'officer-1', status,
    assessedAt: '2026-09-26T12:24:00.000Z', createdAt: '2026-09-26T12:24:00.000Z',
    updatedAt: '2026-09-26T12:24:00.000Z', ...overrides
  };
}

function savedResult(): RiskAssessmentResponse {
  return {
    assessment: assessment('ACTIVE'),
    incident: {
      id: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] },
      reportIds: [], status: 'ACTIVE', createdById: 'officer-1',
      createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z'
    },
    reports: []
  };
}

beforeEach(() => {
  state.data = null;
  state.loading = false;
  state.error = null;
  state.actions.clear();
  state.push.mockReset();
});

it('shows a local loading state while history loads', () => {
  const markup = renderToStaticMarkup(<AssessmentHistorySection state={{ kind: 'loading' }} officer={{ id: 'officer-1', name: 'Officer One' }} onRetry={() => {}} />);

  expect(markup).toContain('Assessment History');
  expect(markup).toContain('Loading assessment history');
  expect(markup).toContain('Loading indicator');
});

it('shows every returned status with current, risk, score, date, and available assessor information', () => {
  const markup = renderToStaticMarkup(<AssessmentHistorySection state={{
    kind: 'loaded', assessments: [
      assessment('ACTIVE'),
      assessment('CLOSED', { id: 'assessment-closed', finalRiskLevel: 'MODERATE', calculatedScore: 12, assessedById: 'officer-2' }),
      assessment('VOID', { id: 'assessment-void' })
    ]
  }} officer={{ id: 'officer-1', name: 'Officer One' }} onRetry={() => {}} />);

  expect(markup).toContain('Current');
  expect(markup).toContain('Historical');
  expect(markup).toContain('ACTIVE');
  expect(markup).toContain('CLOSED');
  expect(markup).toContain('VOID');
  expect(markup).toContain('Calculated Score: 18');
  expect(markup).toContain('Calculated Score: 12');
  expect(markup).toContain('Officer One');
  expect(markup).toContain('officer-2');
  expect(markup).toContain('Assessment Date / Time');
});

it('shows an empty state only after a successful empty history response', () => {
  const markup = renderToStaticMarkup(<AssessmentHistorySection state={{ kind: 'loaded', assessments: [] }} officer={{ id: 'officer-1', name: 'Officer One' }} onRetry={() => {}} />);

  expect(markup).toContain('No assessment history available.');
  expect(markup).not.toContain('Unable to load assessment history.');
});

it('shows a retry action for history errors', () => {
  const retry = vi.fn();
  renderToStaticMarkup(<AssessmentHistorySection state={{ kind: 'error' }} officer={{ id: 'officer-1', name: 'Officer One' }} onRetry={retry} />);

  expect(state.actions.has('Retry')).toBe(true);
  state.actions.get('Retry')!();
  expect(retry).toHaveBeenCalledOnce();
});

it('keeps the saved assessment visible while history is independently loading', () => {
  state.data = savedResult();

  const markup = renderToStaticMarkup(<RiskAssessmentResultScreen />);

  expect(markup).toContain('Final Risk Level');
  expect(markup).toContain('Assessment History');
  expect(markup).toContain('Loading assessment history');
  expect(markup).toContain('Create Warning');
});
