import type { ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskAssessmentResponse, RiskAssessmentForIncidentResponse } from '@safealert/contracts';
import { ApiClientError } from '@/services/api/client';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

const state = vi.hoisted(() => ({
  params: {} as { incidentId?: string; assessmentId?: string },
  focusEffect: null as (() => void | (() => void)) | null,
  resource: null as { data: unknown; loading: boolean; error: string | null; reload: () => void } | null,
  loader: null as (() => Promise<unknown>) | null,
  hooks: [] as unknown[], hookIndex: 0,
  refs: [] as { current: unknown }[], refIndex: 0,
  effectDeps: [] as (readonly unknown[] | undefined)[], effectIndex: 0,
  effects: [] as (() => void | (() => void))[],
  actions: new Map<string, () => void>(),
  inputs: new Map<string, (value: string) => void>(),
  optionActions: new Map<string, (value: string) => void>(),
  getAssessment: vi.fn(),
  getAssessmentForIncident: vi.fn(),
  calculateRisk: vi.fn(),
  reassess: vi.fn(),
  replace: vi.fn()
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.hookIndex++;
      if (index >= state.hooks.length) state.hooks[index] = initial;
      return [state.hooks[index], (next: unknown) => {
        state.hooks[index] = typeof next === 'function'
          ? Reflect.apply(next, undefined, [state.hooks[index]])
          : next;
      }];
    },
    useRef: (initial: unknown) => {
      const index = state.refIndex++;
      if (index >= state.refs.length) state.refs[index] = { current: initial };
      return state.refs[index];
    },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = state.effectIndex++;
      const prior = state.effectDeps[index];
      const changed = !deps || !prior || deps.some((dependency, depIndex) => dependency !== prior[depIndex]);
      if (changed) {
        state.effects.push(effect);
        state.effectDeps[index] = deps;
      }
    }
  };
});

vi.mock('react-native', () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TextInput: ({ accessibilityLabel, value, onChangeText }: { accessibilityLabel: string; value: string; onChangeText: (value: string) => void }) => {
    state.inputs.set(accessibilityLabel, onChangeText);
    return <input aria-label={accessibilityLabel} value={value} readOnly />;
  }
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: state.replace }),
  useLocalSearchParams: () => state.params,
  useFocusEffect: (effect: () => void | (() => void)) => { state.focusEffect = effect; }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'officer-token' }) }));
vi.mock('@/services/api/client', () => ({ ApiClientError: class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
} }));
vi.mock('../api/riskAssessmentApi', () => ({
  calculateRiskAssessment: state.calculateRisk, createRiskAssessment: vi.fn(),
  getRiskAssessment: state.getAssessment, getRiskAssessmentForIncident: state.getAssessmentForIncident,
  reassessRiskAssessment: state.reassess
}));
vi.mock('../hooks/useAssessmentResource', () => ({
  useAssessmentResource: (loader: () => Promise<unknown>) => {
    state.loader = loader;
    return state.resource ?? { data: null, loading: true, error: null, reload: vi.fn() };
  }
}));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress }: { label: string; onPress: () => void; disabled?: boolean }) => {
    state.actions.set(label, onPress);
    return <button onClick={onPress}>{label}</button>;
  },
  AssessmentLoadState: ({ loading }: { loading: boolean }) => <span>{loading ? 'Loading' : 'Error'}</span>,
  AssessmentOptions: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => {
    state.optionActions.set(label, onChange);
    return <div>{label}: {value}</div>;
  },
  AssessmentPage: ({ title, children }: { title: string; children?: ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  IncidentAssessmentContext: () => <div>Incident evidence</div>,
  assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('./RiskDecisionScreen', () => ({ RiskDecisionScreen: ({ onSave, onEdit, onReason, saveLabel }: {
  onSave: () => void; onEdit: () => void; onReason: (value: string) => void; saveLabel?: string
}) => {
  state.actions.set(saveLabel ?? 'SAVE ASSESSMENT', onSave);
  state.actions.set('Edit factors', onEdit);
  state.inputs.set('Decision Reason', onReason);
  return <div>Risk decision<button onClick={onSave}>{saveLabel ?? 'SAVE ASSESSMENT'}</button></div>;
} }));

import { CreateRiskAssessmentScreen } from './CreateRiskAssessmentScreen';

const response: RiskAssessmentResponse = {
  assessment: {
    id: 'assessment-1', incidentId: 'incident-1', hazardSeverity: 'HIGH', peopleAffected: 18,
    vulnerablePeople: 6, roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
    waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', calculatedScore: 18,
    systemSuggestedRisk: 'HIGH', finalRiskLevel: 'HIGH', assessedById: 'officer-1', status: 'ACTIVE',
    isDeleted: false,
    assessedAt: '2026-09-26T12:00:00.000Z', createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z'
  },
  incident: {
    id: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] },
    reportIds: ['report-1'], status: 'ACTIVE', createdById: 'officer-1',
    createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T11:00:00.000Z'
  },
  reports: [{
    id: 'report-1', residentId: 'resident-1', hazardType: 'FLOOD', severity: 'HIGH',
    description: 'Water is rising.', location: { type: 'Point', coordinates: [79.86, 6.92] },
    status: 'VERIFIED', createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T11:00:00.000Z'
  }]
};

beforeEach(() => {
  state.params = {};
  state.focusEffect = null;
  state.resource = null;
  state.loader = null;
  state.hooks = [];
  state.hookIndex = 0;
  state.refs = [];
  state.refIndex = 0;
  state.effectDeps = [];
  state.effectIndex = 0;
  state.effects = [];
  state.actions.clear();
  state.inputs.clear();
  state.optionActions.clear();
  state.getAssessment.mockReset();
  state.getAssessmentForIncident.mockReset();
  state.calculateRisk.mockReset();
  state.reassess.mockReset();
  state.replace.mockReset();
});

function renderScreen() {
  state.hookIndex = 0;
  state.refIndex = 0;
  state.effectIndex = 0;
  state.effects = [];
  state.actions.clear();
  state.inputs.clear();
  state.optionActions.clear();
  const markup = renderToStaticMarkup(<CreateRiskAssessmentScreen />);
  state.effects.forEach((effect) => { effect(); });
  return markup;
}

it('loads an assessment and shows the reassessment context when the source ID is routed', async () => {
  state.params = { assessmentId: 'assessment-1' };
  state.resource = { data: response, loading: false, error: null, reload: vi.fn() };
  state.getAssessment.mockResolvedValue(response);

  const markup = renderScreen();
  renderScreen();
  await expect(state.loader?.()).resolves.toEqual(response);

  expect(state.getAssessment).toHaveBeenCalledWith('assessment-1', 'officer-token');
  expect(markup).toContain('Reassess Risk');
  expect(markup).toContain('Current Assessment');
  expect(markup).toContain('Reason for Reassessment');
  expect(markup).toContain('Score: 18');
});

it('waits for matching route data before prefilling a different reassessment source', () => {
  state.params = { assessmentId: 'assessment-1' };
  state.resource = { data: response, loading: false, error: null, reload: vi.fn() };
  renderScreen();

  state.params = { assessmentId: 'assessment-2' };
  const staleMarkup = renderScreen();
  expect(staleMarkup).toContain('Loading');
  expect(staleMarkup).not.toContain('value="18"');

  const secondResponse: RiskAssessmentResponse = {
    ...response, assessment: { ...response.assessment, id: 'assessment-2', peopleAffected: 33 }
  };
  state.resource = { data: secondResponse, loading: false, error: null, reload: vi.fn() };
  renderScreen();
  expect(renderScreen()).toContain('value="33"');
});

it('offers recovery and displays lookup failures when the loaded source is already closed', async () => {
  state.params = { assessmentId: 'assessment-1' };
  state.resource = { data: {
    ...response, assessment: { ...response.assessment, status: 'CLOSED' }
  }, loading: false, error: null, reload: vi.fn() };

  expect(renderScreen()).toContain('View latest assessment');
  expect(state.actions.has('View latest assessment')).toBe(true);
  state.getAssessmentForIncident.mockRejectedValue(new Error('Latest assessment lookup failed.'));
  state.actions.get('View latest assessment')!();
  await Promise.resolve();
  await Promise.resolve();
  expect(renderScreen()).toContain('Latest assessment lookup failed.');
});

it('keeps the existing incident create route and loader when no assessment ID is supplied', async () => {
  state.params = { incidentId: 'incident-1' };
  const incidentResponse: RiskAssessmentForIncidentResponse = {
    assessment: null, incident: response.incident, reports: response.reports
  };
  state.getAssessmentForIncident.mockResolvedValue(incidentResponse);

  const markup = renderScreen();
  await expect(state.loader?.()).resolves.toEqual(incidentResponse);

  expect(state.getAssessmentForIncident).toHaveBeenCalledWith('incident-1', 'officer-token');
  expect(markup).toContain('Assess Risk');
});

it('shows reassessment with prefilled factors and clears the old preview when a factor changes', async () => {
  state.params = { assessmentId: 'assessment-1' };
  state.resource = { data: response, loading: false, error: null, reload: vi.fn() };
  state.calculateRisk.mockResolvedValue({ calculatedScore: 27, systemSuggestedRisk: 'CRITICAL' });

  renderScreen();
  const prefilled = renderScreen();
  expect(prefilled).toContain('aria-label="People Affected"');
  expect(prefilled).toContain('value="18"');
  expect(prefilled).toContain('aria-label="Vulnerable People"');
  expect(prefilled).toContain('value="6"');
  state.inputs.get('Reason for Reassessment')!('Water levels are rising quickly.');
  renderScreen();
  state.actions.get('CALCULATE RISK')!();
  await Promise.resolve();
  await Promise.resolve();
  expect(renderScreen()).toContain('Risk decision');

  state.actions.get('Edit factors')!();
  renderScreen();
  state.inputs.get('People Affected')!('20');

  expect(renderScreen()).not.toContain('Risk decision');
  expect(state.calculateRisk).toHaveBeenCalledOnce();
});

it('preserves reassessment edits when the route regains focus', () => {
  state.params = { assessmentId: 'assessment-1' };
  state.resource = { data: response, loading: false, error: null, reload: vi.fn() };

  renderScreen();
  renderScreen();
  state.inputs.get('People Affected')!('24');
  renderScreen();
  const cleanup = state.focusEffect?.();
  if (typeof cleanup === 'function') cleanup();
  state.focusEffect?.();

  expect(renderScreen()).toContain('value="24"');
  expect(renderScreen()).toContain('value="6"');
});

it('preserves reassessment input and shows a stale conflict after a failed save', async () => {
  state.params = { assessmentId: 'assessment-1' };
  state.resource = { data: response, loading: false, error: null, reload: vi.fn() };
  state.calculateRisk.mockResolvedValue({ calculatedScore: 27, systemSuggestedRisk: 'CRITICAL' });
  state.reassess.mockRejectedValue(new ApiClientError(
    409, 'ASSESSMENT_NOT_ACTIVE', 'This assessment is no longer active. Refresh to view the latest assessment.'
  ));
  state.getAssessmentForIncident.mockResolvedValue({ ...response, assessment: {
    ...response.assessment, id: 'assessment-latest'
  } });

  renderScreen();
  renderScreen();
  state.inputs.get('Reason for Reassessment')!('Water levels are rising quickly.');
  renderScreen();
  state.actions.get('CALCULATE RISK')!();
  await Promise.resolve();
  await Promise.resolve();
  renderScreen();
  state.inputs.get('Decision Reason')!('Conditions support a critical rating.');
  renderScreen();
  state.actions.get('SAVE REASSESSMENT')!();
  await Promise.resolve();
  await Promise.resolve();
  const decisionMarkup = renderScreen();
  expect(decisionMarkup).toContain('This assessment is no longer active. Refresh to view the latest assessment.');
  expect(decisionMarkup).toContain('View latest assessment');
  state.actions.get('Edit factors')!();
  const formMarkup = renderScreen();
  expect(formMarkup).toContain('aria-label="Reason for Reassessment"');
  expect(formMarkup).toContain('value="Water levels are rising quickly."');
  state.actions.get('View latest assessment')!();
  await Promise.resolve();
  await Promise.resolve();
  expect(state.getAssessmentForIncident).toHaveBeenCalledWith('incident-1', 'officer-token');
  expect(renderScreen()).toContain('View Risk Assessment');
  expect(state.replace).not.toHaveBeenCalled();
});

it('saves a reassessment and replaces the route with the new assessment ID', async () => {
  state.params = { assessmentId: 'assessment-1' };
  state.resource = { data: response, loading: false, error: null, reload: vi.fn() };
  state.calculateRisk.mockResolvedValue({ calculatedScore: 27, systemSuggestedRisk: 'CRITICAL' });
  state.reassess.mockResolvedValue({
    ...response,
    assessment: {
      ...response.assessment, id: 'assessment-new', status: 'ACTIVE', previousAssessmentId: 'assessment-1',
      reassessmentReason: 'Water levels are rising quickly.', calculatedScore: 27, systemSuggestedRisk: 'CRITICAL', finalRiskLevel: 'CRITICAL'
    }
  });

  renderScreen();
  renderScreen();
  state.inputs.get('Reason for Reassessment')!('Water levels are rising quickly.');
  renderScreen();
  state.actions.get('CALCULATE RISK')!();
  await Promise.resolve();
  await Promise.resolve();
  renderScreen();
  state.actions.get('SAVE REASSESSMENT')!();
  await Promise.resolve();
  await Promise.resolve();

  expect(state.reassess).toHaveBeenCalledWith('assessment-1', expect.objectContaining({
    peopleAffected: 18, vulnerablePeople: 6, finalRiskLevel: 'CRITICAL',
    reassessmentReason: 'Water levels are rising quickly.'
  }), 'officer-token');
  expect(state.replace).toHaveBeenCalledWith({
    pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'assessment-new' }
  });
});
