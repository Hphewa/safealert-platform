import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import { createInitialAssessmentDraft, type RiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraftState';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

const state = vi.hoisted(() => ({
  step: 'situation', incidentId: 'incident-1', draft: null as RiskAssessmentDraft | null,
  actions: new Map<string, () => void>(), pushes: [] as unknown[],
  disabled: new Map<string, boolean>(),
  options: new Map<string, { value: string; onChange: (value: string) => void }>(),
  inputs: new Map<string, (value: string) => void>(),
  hooks: [] as unknown[], hookIndex: 0,
  calculate: vi.fn(), create: vi.fn(), lookup: vi.fn(), loadOverview: vi.fn(), replace: vi.fn(), reset: vi.fn(),
  focusEffect: null as (() => (() => void)) | null,
  setPreview: vi.fn((factors: RiskAssessmentDraft['factors'], result: unknown) => {
    if (state.draft) state.draft = { ...state.draft, calculationPreview: { factors: factors as never, result: result as never } };
  }),
  setFinalRisk: vi.fn((finalRiskLevel: RiskAssessmentDraft['finalRiskLevel']) => {
    if (state.draft) state.draft = { ...state.draft, finalRiskLevel };
  }),
  setDecisionReason: vi.fn((decisionReason: string) => {
    if (state.draft) state.draft = { ...state.draft, decisionReason };
  })
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => {
    const index = state.hookIndex++;
    if (index >= state.hooks.length) state.hooks[index] = initial;
    return [state.hooks[index], (next: unknown) => {
      state.hooks[index] = typeof next === 'function' ? Reflect.apply(next, undefined, [state.hooks[index]]) : next;
    }];
  } };
});

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ step: state.step, incidentId: state.incidentId }),
  useRouter: () => ({ push: (route: unknown) => state.pushes.push(route), replace: (route: unknown) => { state.replace(route); state.pushes.push(route); }, dismissTo: vi.fn() }),
  useFocusEffect: (effect: () => () => void) => { state.focusEffect = effect; }
}));
vi.mock('react-native', () => ({
  Pressable: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: ({ accessibilityLabel, value, onChangeText }: { accessibilityLabel: string; value: string; onChangeText: (value: string) => void }) => {
    state.inputs.set(accessibilityLabel, onChangeText);
    return <input aria-label={accessibilityLabel} value={value} readOnly />;
  },
  KeyboardAvoidingView: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  Platform: { OS: 'ios' },
  StyleSheet: { create: (value: unknown) => value }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'token' }) }));
vi.mock('@/services/api/client', () => ({ ApiClientError: class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
} }));
vi.mock('../assessment-flow/riskAssessmentDraft', () => ({ useRiskAssessmentDraft: () => ({
  draft: state.draft,
  updateSingleFactor: (field: keyof RiskAssessmentDraft['factors'], value: string) => {
    if (state.draft) state.draft = { ...state.draft, factors: { ...state.draft.factors, [field]: value }, calculationPreview: null };
  }, setCalculationPreview: state.setPreview, setFinalRisk: state.setFinalRisk,
  setDecisionReason: state.setDecisionReason, resetAssessmentDraft: state.reset
}) }));
vi.mock('../hooks/useAssessmentDraftExitGuard', () => ({ useAssessmentDraftExitGuard: () => vi.fn() }));
vi.mock('../api/incidentOverview', () => ({
  loadIncidentOverview: state.loadOverview
}));
vi.mock('../api/riskAssessmentApi', () => ({ calculateRiskAssessment: state.calculate, createRiskAssessment: state.create, getRiskAssessmentForIncident: state.lookup }));
vi.mock('../hooks/useAssessmentResource', () => ({ useAssessmentResource: () => ({
  data: { incident: { id: 'incident-1', hazardType: 'FLOOD', status: 'ACTIVE', location: { type: 'Point', coordinates: [79.9, 6.8] } },
    reports: [], assessment: null, canStartInitialAssessment: true }, loading: false, error: null, reload: vi.fn()
}) }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('../../shared/maps/HumanReadableLocation', () => ({ HumanReadableLocation: () => <span>Pannipitiya, Western Province</span> }));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentPage: ({ title, children }: { title: string; children?: ReactNode }) => <article><h1>{title}</h1>{children}</article>,
  AssessmentButton: ({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) => {
    state.actions.set(label, onPress); state.disabled.set(label, disabled); return <button disabled={disabled}>{label}</button>;
  },
  AssessmentOptions: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => {
    state.options.set(label, { value, onChange }); return <fieldset><legend>{label}</legend><span>{value}</span></fieldset>;
  },
  AssessmentDetail: ({ label, value }: { label: string; value: string | number }) => <div>{label}: {value}</div>,
  AssessmentFactorSummary: () => <div>Assessment factors</div>,
  AssessmentLoadState: ({ error }: { error: string | null }) => <span>{error ?? 'Loading'}</span>,
  assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../officerNavigation', () => ({ officerBottomNavItems: [] }));

import { InitialAssessmentWizardScreen } from './InitialAssessmentWizardScreen';

function render(step = 'situation') {
  state.hookIndex = 0;
  state.step = step;
  state.actions.clear(); state.disabled.clear(); state.options.clear(); state.inputs.clear(); state.pushes.length = 0;
  return renderToStaticMarkup(<InitialAssessmentWizardScreen />);
}

beforeEach(() => {
  state.step = 'situation'; state.incidentId = 'incident-1'; state.draft = createInitialAssessmentDraft('incident-1');
  state.actions.clear(); state.disabled.clear(); state.options.clear(); state.inputs.clear(); state.pushes.length = 0; state.hooks = []; state.hookIndex = 0; state.focusEffect = null;
  state.loadOverview.mockResolvedValue({ incident: { id: 'incident-1', hazardType: 'FLOOD', status: 'ACTIVE', location: { type: 'Point', coordinates: [79.9, 6.8] } }, reports: [], assessment: null, canStartInitialAssessment: true });
  for (const mock of [state.calculate, state.create, state.lookup, state.loadOverview, state.replace, state.reset, state.setPreview, state.setFinalRisk, state.setDecisionReason]) mock.mockClear();
});

it('groups the initial assessment factors into focused steps and keeps Review read-only', () => {
  const situation = render('situation');
  expect(situation).toContain('Situation');
  expect(situation).toContain('Hazard Severity');
  expect(situation).toContain('People Affected');
  expect(situation).toContain('Vulnerable People');
  expect(situation).not.toContain('Road Accessibility');

  const impact = render('impact');
  expect(impact).toContain('Impact &amp; Access');
  expect(impact).toContain('Road Accessibility');
  expect(impact).toContain('Infrastructure Impact');
  expect(impact).not.toContain('People Affected');

  const environment = render('environment');
  expect(environment).toContain('Water Level Trend');
  expect(environment).toContain('Weather Condition');

  const review = render('review');
  expect(review).toContain('Review Assessment');
  expect(review).toContain('Edit Situation');
  expect(review).toContain('Edit Impact &amp; Access');
  expect(review).toContain('Edit Environment');
  expect(review).not.toContain('<input');
});

it('shows three-step progress on input steps and navigates between steps without route factor data', () => {
  const situation = render('situation');
  expect(situation).toContain('Step 1 of 3');
  state.inputs.get('People Affected')!('12');
  state.inputs.get('Vulnerable People')!('3');
  render('situation');
  state.actions.get('CONTINUE')!();
  expect(state.pushes.at(-1)).toEqual({ pathname: '/officer/assessments/wizard/[step]', params: { step: 'impact', incidentId: 'incident-1' } });

  const impact = render('impact');
  expect(impact).toContain('Step 2 of 3');
  state.actions.get('CONTINUE')!();
  expect(state.pushes.at(-1)).toEqual({ pathname: '/officer/assessments/wizard/[step]', params: { step: 'environment', incidentId: 'incident-1' } });

  expect(render('environment')).toContain('Step 3 of 3');
});

it('shows people-count errors after Continue and retains entered values in the shared draft', () => {
  const markup = render('situation');
  expect(markup).not.toContain('Enter a whole number');
  state.inputs.get('People Affected')!('12');
  state.inputs.get('Vulnerable People')!('13');
  render('situation');
  state.actions.get('CONTINUE')!();
  expect(render('situation')).toContain('Vulnerable people cannot exceed people affected.');
  expect(state.draft?.factors).toMatchObject({ peopleAffected: '12', vulnerablePeople: '13' });
  expect(state.pushes).toHaveLength(0);
});

it('routes Review edits to the matching input step and back to the incident overview', () => {
  render('review');
  state.actions.get('Edit Situation')!();
  expect(state.pushes.at(-1)).toEqual({ pathname: '/officer/assessments/wizard/[step]', params: { step: 'situation', incidentId: 'incident-1' } });
});

const completeFactors = {
  hazardSeverity: 'MODERATE' as const, peopleAffected: '12', vulnerablePeople: '3', roadAccessibility: 'FULLY_BLOCKED' as const,
  infrastructureImpact: 'MODERATE' as const, waterLevelTrend: 'RISING' as const, weatherCondition: 'HEAVY_RAIN' as const
};
const completeFactorSnapshot = {
  ...completeFactors, peopleAffected: 12, vulnerablePeople: 3
};
const calculation = { calculatedScore: 18, systemSuggestedRisk: 'HIGH' as const, factorContributions: [], calculationVersion: 'risk-v1' as const };
function setPreviewDraft() {
  state.draft = { ...createInitialAssessmentDraft('incident-1'), factors: { ...completeFactors },
    calculationPreview: { factors: completeFactorSnapshot, result: calculation }, finalRiskLevel: 'HIGH' };
}

it('calculates only from Review using the exact factor snapshot and opens Recommendation', async () => {
  state.draft = { ...state.draft!, factors: { ...completeFactors } };
  state.calculate.mockResolvedValue(calculation);
  expect(state.calculate).not.toHaveBeenCalled();
  render('review');
  expect(state.calculate).not.toHaveBeenCalled();
  state.actions.get('CALCULATE RISK')!();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(state.calculate).toHaveBeenCalledWith({ incidentId: 'incident-1', ...completeFactorSnapshot }, 'token');
  expect(state.setPreview).toHaveBeenCalledWith(completeFactorSnapshot, calculation);
  expect(state.pushes.at(-1)).toEqual({ pathname: '/officer/assessments/wizard/[step]', params: { step: 'recommendation', incidentId: 'incident-1' } });
});

it('shows the system risk more prominently than score without inventing factor contributions', () => {
  setPreviewDraft();
  const markup = render('recommendation');
  expect(markup).toContain('Risk Recommendation');
  expect(markup).toContain('HIGH');
  expect(markup).toContain('Risk score');
  expect(markup).toContain('18');
  expect(markup).toContain('Assessment factors');
  expect(markup).toContain('This recommendation supports officer decision-making');
  expect(markup).not.toContain('+6 Hazard');
  expect(markup).not.toContain('+4 Weather');
  expect(markup).not.toContain('+3 Road');
});

it('shows optional Officer Notes for a matching decision and requires an override reason for a different risk', () => {
  setPreviewDraft();
  let markup = render('decision');
  expect(markup).toContain('Officer Notes (optional)');
  expect(markup).not.toContain('Reason for Override');
  state.options.get('Final Risk Level')!.onChange('CRITICAL');
  markup = render('decision');
  expect(markup).toContain('You are overriding the system recommendation.');
  expect(markup).toContain('Reason for Override *');
  expect(markup).toContain('at least 10 characters');
});

it('requires explicit save confirmation and navigates to Monitoring only after a confirmed successful save', async () => {
  setPreviewDraft();
  state.create.mockResolvedValue({ assessment: { id: 'assessment-new' }, incident: { id: 'incident-1' } });
  render('decision');
  state.actions.get('SAVE ASSESSMENT')!();
  const confirmation = render('decision');
  expect(confirmation).toContain('Save Assessment?');
  expect(confirmation).toContain('Final Risk');
  expect(confirmation).toContain('available in Monitoring');
  expect(state.create).not.toHaveBeenCalled();
  state.actions.get('Cancel')!();
  expect(render('decision')).not.toContain('Save Assessment?');
  state.actions.get('SAVE ASSESSMENT')!(); render('decision');
  state.actions.get('Confirm & Save')!();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(state.create).toHaveBeenCalledWith({ incidentId: 'incident-1', ...completeFactorSnapshot, finalRiskLevel: 'HIGH' }, 'token');
  expect(state.reset).toHaveBeenCalledOnce();
  expect(state.replace).toHaveBeenCalledWith({ pathname: '/officer/monitoring/[incidentId]', params: { incidentId: 'incident-1', notice: 'assessment-saved' } });
});

it('requires a ten-character reason for an override while allowing matching officer notes to stay optional', () => {
  setPreviewDraft();
  render('decision');
  state.options.get('Final Risk Level')!.onChange('CRITICAL');
  render('decision');
  state.actions.get('SAVE ASSESSMENT')!();
  expect(render('decision')).toContain('Enter a decision reason of at least 10 characters.');
  expect(state.actions.has('Confirm & Save')).toBe(false);
  state.setDecisionReason('Conditions changed.');
  render('decision');
  state.actions.get('SAVE ASSESSMENT')!();
  expect(render('decision')).toContain('Save Assessment?');
});

it('ignores a calculation that completes after the Review screen loses focus', async () => {
  state.draft = { ...state.draft!, factors: { ...completeFactors } };
  let resolveCalculation!: (result: typeof calculation) => void;
  state.calculate.mockReturnValue(new Promise((resolve) => { resolveCalculation = resolve; }));
  render('review');
  const blur = state.focusEffect!();
  const pending = state.actions.get('CALCULATE RISK')!();
  await Promise.resolve(); await Promise.resolve();
  expect(state.calculate).toHaveBeenCalledOnce();
  blur();
  resolveCalculation(calculation);
  await Promise.resolve(); await Promise.resolve();
  expect(state.setPreview).not.toHaveBeenCalled();
  expect(state.pushes).toHaveLength(0);
  await pending;
});

it('keeps the initial draft after a failed save so the officer can retry', async () => {
  setPreviewDraft();
  state.create.mockRejectedValue(new Error('Network unavailable.'));
  render('decision'); state.actions.get('SAVE ASSESSMENT')!(); render('decision');
  const pending = state.actions.get('Confirm & Save')!();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await pending;
  expect(state.reset).not.toHaveBeenCalled();
  expect(state.draft?.incidentId).toBe('incident-1');
  expect(render('decision')).toContain('Network unavailable.');
});

it('does not allow saving after the calculation preview has been invalidated', () => {
  state.draft = { ...createInitialAssessmentDraft('incident-1'), factors: { ...completeFactors }, calculationPreview: null };
  const markup = render('decision');
  expect(markup).toContain('Calculate a new recommendation');
  expect(state.actions.has('SAVE ASSESSMENT')).toBe(false);
});
