import type { ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

const state = vi.hoisted(() => ({
  params: {} as { incidentId?: string; assessmentId?: string },
  backToIncidentId: undefined as string | undefined,
  assessmentDraft: null as {
    mode: string; incidentId: string; assessmentId: string | null;
    factors: Record<string, string>; calculationPreview: { factors: Record<string, unknown>; result: unknown } | null;
    finalRiskLevel: string; decisionReason: string; reassessmentReason: string;
  } | null,
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
  createRisk: vi.fn(),
  reassess: vi.fn(),
  replace: vi.fn(),
  redirect: null as unknown
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
  Redirect: ({ href }: { href: unknown }) => { state.redirect = href; return null; },
  useRouter: () => ({ replace: state.replace }),
  useLocalSearchParams: () => state.params,
  useFocusEffect: (effect: () => void | (() => void)) => { state.focusEffect = effect; }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'officer-token' }) }));
vi.mock('../assessment-flow/riskAssessmentDraft', () => {
  const api = {
    get draft() { return state.assessmentDraft; },
    initializeInitialAssessment: (incidentId: string) => {
      state.assessmentDraft = {
        mode: 'INITIAL', incidentId, assessmentId: null,
        factors: { hazardSeverity: 'MODERATE', peopleAffected: '', vulnerablePeople: '', roadAccessibility: 'UNKNOWN', infrastructureImpact: 'NONE', waterLevelTrend: 'UNKNOWN', weatherCondition: 'UNKNOWN' },
        calculationPreview: null, finalRiskLevel: 'LOW', decisionReason: '', reassessmentReason: ''
      };
    },
    initializeReassessment: ({ assessmentId, incidentId, factors, finalRiskLevel }: {
      assessmentId: string; incidentId: string; factors: Record<string, string | number>; finalRiskLevel: string
    }) => {
      state.assessmentDraft = {
        mode: 'REASSESSMENT', incidentId, assessmentId,
        factors: Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, String(value)])),
        calculationPreview: null, finalRiskLevel, decisionReason: '', reassessmentReason: ''
      };
    },
    updateFactors: (factors: Record<string, string>) => {
      if (state.assessmentDraft) state.assessmentDraft = { ...state.assessmentDraft, factors, calculationPreview: null };
    },
    updateSingleFactor: (field: string, value: string) => {
      if (state.assessmentDraft) state.assessmentDraft = {
        ...state.assessmentDraft, factors: { ...state.assessmentDraft.factors, [field]: value }, calculationPreview: null
      };
    },
    setCalculationPreview: (factors: Record<string, unknown>, result: unknown) => {
      if (state.assessmentDraft) state.assessmentDraft = { ...state.assessmentDraft, calculationPreview: { factors, result } };
    },
    clearCalculationPreview: () => {
      if (state.assessmentDraft) state.assessmentDraft = { ...state.assessmentDraft, calculationPreview: null };
    },
    get calculationPreviewIsValid() { return Boolean(state.assessmentDraft?.calculationPreview); },
    setFinalRisk: (finalRiskLevel: string) => {
      if (state.assessmentDraft) state.assessmentDraft = { ...state.assessmentDraft, finalRiskLevel };
    },
    setDecisionReason: (decisionReason: string) => {
      if (state.assessmentDraft) state.assessmentDraft = { ...state.assessmentDraft, decisionReason };
    },
    setReassessmentReason: (reassessmentReason: string) => {
      if (state.assessmentDraft) state.assessmentDraft = { ...state.assessmentDraft, reassessmentReason };
    },
    resetAssessmentDraft: () => { state.assessmentDraft = null; }
  };
  return { useRiskAssessmentDraft: () => api };
});
vi.mock('@/services/api/client', () => ({ ApiClientError: class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
} }));
vi.mock('../api/riskAssessmentApi', () => ({
  calculateRiskAssessment: state.calculateRisk, createRiskAssessment: state.createRisk,
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
  AssessmentPage: ({ title, children, backToIncidentId }: { title: string; children?: ReactNode; backToIncidentId?: string }) => {
    state.backToIncidentId = backToIncidentId;
    return <main><h1>{title}</h1>{children}</main>;
  },
  IncidentAssessmentContext: () => <div>Incident evidence</div>,
  assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('./RiskDecisionScreen', () => ({ RiskDecisionScreen: ({ onSave, onEdit, onReason, onFinalRisk, saveLabel }: {
  onSave: () => void; onEdit: () => void; onReason: (value: string) => void;
  onFinalRisk: (value: string) => void; saveLabel?: string
}) => {
  state.actions.set(saveLabel ?? 'SAVE ASSESSMENT', onSave);
  state.actions.set('Edit factors', onEdit);
  state.actions.set('Choose override risk', () => onFinalRisk('CRITICAL'));
  state.inputs.set('Decision Reason', onReason);
  return <div>Risk decision<button onClick={onSave}>{saveLabel ?? 'SAVE ASSESSMENT'}</button></div>;
} }));

import { CreateRiskAssessmentScreen } from './CreateRiskAssessmentScreen';

beforeEach(() => {
  state.params = {};
  state.assessmentDraft = null;
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
  state.redirect = null;
  state.actions.clear();
  state.inputs.clear();
  state.optionActions.clear();
  state.getAssessment.mockReset();
  state.getAssessmentForIncident.mockReset();
  state.calculateRisk.mockReset();
  state.createRisk.mockReset();
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

it('redirects the legacy reassessment route to the first typed wizard step', () => {
  state.params = { assessmentId: 'assessment-1' };
  renderScreen();
  expect(state.redirect).toEqual({ pathname: '/officer/assessments/reassess/[step]', params: { step: 'reason', assessmentId: 'assessment-1' } });
});
it('redirects the legacy initial create route to Situation without creating a draft', () => {
  state.params = { incidentId: 'incident-1' };
  const markup = renderScreen();
  expect(markup).toBe('');
  expect(state.redirect).toEqual({ pathname: '/officer/assessments/wizard/[step]', params: { step: 'situation', incidentId: 'incident-1' } });
  expect(state.getAssessmentForIncident).not.toHaveBeenCalled();
  expect(state.assessmentDraft).toBeNull();
});
