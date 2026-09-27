import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskAssessmentHistoryResponse, RiskAssessmentResponse } from '@safealert/contracts';
import { ApiClientError } from '../../../../services/api/client';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

const state = vi.hoisted(() => ({
  assessmentId: 'assessment-1',
  accessToken: 'officer-token',
  data: null as unknown,
  loading: false,
  error: null as string | null,
  actions: new Map<string, () => void>(),
  inputs: new Map<string, (value: string) => void>(),
  options: new Map<string, { choices: readonly string[]; choose: (value: string) => void }>(),
  hooks: [] as unknown[], hookIndex: 0,
  refs: [] as { current: unknown }[], refIndex: 0,
  effectDeps: [] as (readonly unknown[] | undefined)[], effectIndex: 0,
  effects: [] as (() => void)[],
  push: vi.fn(), replace: vi.fn(), reload: vi.fn(), close: vi.fn(), softDelete: vi.fn(), history: vi.fn()
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.hookIndex++;
      if (index >= state.hooks.length) state.hooks[index] = initial;
      return [state.hooks[index], (next: unknown) => {
        state.hooks[index] = typeof next === 'function' ? Reflect.apply(next, undefined, [state.hooks[index]]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const index = state.refIndex++;
      if (index >= state.refs.length) state.refs[index] = { current: initial };
      return state.refs[index];
    },
    useEffect: (effect: () => void, deps?: readonly unknown[]) => {
      const index = state.effectIndex++;
      const previous = state.effectDeps[index];
      if (!deps || !previous || deps.some((dependency, depIndex) => dependency !== previous[depIndex])) {
        state.effects.push(effect);
        state.effectDeps[index] = deps;
      }
    }
  };
});

vi.mock('react-native', () => ({
  ActivityIndicator: () => <span>Loading indicator</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: ({ accessibilityLabel, value, onChangeText }: { accessibilityLabel: string; value: string; onChangeText: (value: string) => void }) => {
    state.inputs.set(accessibilityLabel, onChangeText);
    return <input aria-label={accessibilityLabel} value={value} readOnly />;
  }
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }),
  useLocalSearchParams: () => ({ assessmentId: state.assessmentId })
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({
  accessToken: state.accessToken, user: { id: 'officer-1', name: 'Officer One' }
}) }));
vi.mock('../../shared/components/PriorityBadge', () => ({
  PriorityBadge: ({ priority }: { priority: string }) => <span>{priority}</span>
}));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => {
    state.actions.set(label, onPress);
    return <button disabled={disabled}>{label}</button>;
  },
  AssessmentOptions: ({ label, options, onChange, value }: { label: string; options: readonly string[]; onChange: (value: string) => void; value: string }) => {
    state.options.set(label, { choices: options, choose: onChange });
    return <div>{label}: {options.join(', ')}; selected: {value}</div>;
  },
  AssessmentDetail: ({ label, value }: { label: string; value: string | number }) => <span>{label}: {value}</span>,
  AssessmentFactorSummary: () => <div>Assessment factors</div>,
  AssessmentLoadState: () => <div>Assessment loading state</div>,
  AssessmentPage: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
  IncidentAssessmentContext: () => <div>Incident evidence</div>,
  assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../hooks/useAssessmentResource', () => ({
  useAssessmentResource: () => ({ data: state.data, loading: state.loading, error: state.error, reload: state.reload })
}));
vi.mock('../api/riskAssessmentApi', () => ({
  getRiskAssessment: vi.fn(), getRiskAssessmentHistory: state.history,
  closeRiskAssessment: state.close, softDeleteRiskAssessment: state.softDelete
}));

import { AssessmentHistorySection, RiskAssessmentResultScreen } from './RiskAssessmentResultScreen';

function assessment(status: 'ACTIVE' | 'CLOSED' | 'VOID', overrides: Partial<RiskAssessmentHistoryResponse['assessments'][number]> = {}): RiskAssessmentHistoryResponse['assessments'][number] {
  return {
    id: `assessment-${status.toLowerCase()}`, incidentId: 'incident-1',
    hazardSeverity: 'HIGH', peopleAffected: 4, vulnerablePeople: 1,
    roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING',
    weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH', calculatedScore: 18,
    systemSuggestedRisk: 'HIGH', assessedById: 'officer-1', status,
    isDeleted: false,
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
  state.assessmentId = 'assessment-1';
  state.accessToken = 'officer-token';
  state.data = null;
  state.loading = false;
  state.error = null;
  state.actions.clear();
  state.inputs.clear();
  state.options.clear();
  state.hooks = [];
  state.refs = [];
  state.effectDeps = [];
  state.effects = [];
  state.push.mockReset();
  state.replace.mockReset();
  state.reload.mockReset();
  state.close.mockReset();
  state.softDelete.mockReset();
  state.history.mockReset();
  state.history.mockResolvedValue({ assessments: [] });
});

function renderResult() {
  state.hookIndex = 0;
  state.refIndex = 0;
  state.effectIndex = 0;
  state.actions.clear();
  state.inputs.clear();
  state.options.clear();
  return renderToStaticMarkup(<RiskAssessmentResultScreen />);
}

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

it('offers reassessment for the active assessment and routes with its ID', () => {
  state.data = savedResult();

  const markup = renderToStaticMarkup(<RiskAssessmentResultScreen />);

  expect(markup).toContain('REASSESS RISK');
  state.actions.get('REASSESS RISK')!();
  expect(state.push).toHaveBeenCalledWith({
    pathname: '/officer/assessments/create', params: { assessmentId: 'assessment-active' }
  });
});

it.each(['CLOSED', 'VOID'] as const)('does not offer reassessment for %s assessments', (status) => {
  const result = savedResult();
  result.assessment = assessment(status, { id: `assessment-${status.toLowerCase()}` });
  state.data = result;

  const markup = renderToStaticMarkup(<RiskAssessmentResultScreen />);

  expect(markup).not.toContain('REASSESS RISK');
});

it('shows reassessment lineage and closure details in existing assessment history', () => {
  const markup = renderToStaticMarkup(<AssessmentHistorySection state={{ kind: 'loaded', assessments: [
    assessment('ACTIVE', {
      id: 'assessment-new', previousAssessmentId: 'assessment-old',
      reassessmentReason: 'Water levels are rising quickly.'
    }),
    assessment('CLOSED', {
      id: 'assessment-old', closureReason: 'REASSESSED',
      closedAt: '2026-09-26T12:30:00.000Z', closedById: 'officer-1'
    })
  ] }} officer={{ id: 'officer-1', name: 'Officer One' }} onRetry={() => {}} />);

  expect(markup).toContain('Previous Assessment: assessment-old');
  expect(markup).toContain('Reason for Reassessment: Water levels are rising quickly.');
  expect(markup).toContain('Closure Reason: REASSESSED');
  expect(markup).toContain('Closed By: Officer One');
});

it('shows a manual closure note in assessment history', () => {
  const markup = renderToStaticMarkup(<AssessmentHistorySection state={{
    kind: 'loaded', assessments: [assessment('CLOSED', {
      closureReason: 'OTHER', closureNote: 'The hazard has permanently ended.'
    })]
  }} officer={{ id: 'officer-1', name: 'Officer One' }} onRetry={() => {}} />);

  expect(markup).toContain('Closure Note: The hazard has permanently ended.');
});

it('shows warning, reassessment, and close actions only while active', () => {
  const result = savedResult();
  state.data = result;
  expect(renderResult()).toContain('CLOSE ASSESSMENT');
  expect(renderResult()).toContain('Create Warning');
  expect(renderResult()).toContain('REASSESS RISK');
  for (const status of ['CLOSED', 'VOID'] as const) {
    state.hooks = [];
    result.assessment = assessment(status);
    const markup = renderResult();
    expect(markup).not.toContain('CLOSE ASSESSMENT');
    expect(markup).not.toContain('Create Warning');
    expect(markup).not.toContain('REASSESS RISK');
  }
});

it('opens and cancels an inline close form with manual reasons only', () => {
  state.data = savedResult();
  renderResult();
  state.actions.get('CLOSE ASSESSMENT')!();
  const markup = renderResult();
  expect(markup).toContain('Closure Reason');
  expect(markup).toContain('INCIDENT_RESOLVED');
  expect(markup).toContain('OTHER');
  expect(markup).not.toContain('REASSESSED');
  expect(state.options.get('Closure Reason')?.choices).not.toContain('REASSESSED');
  expect(markup).toContain('Closure Note');
  state.actions.get('Cancel')!();
  expect(renderResult()).not.toContain('Confirm Close');
});

it('requires a meaningful note for OTHER and sends a trimmed note once', async () => {
  state.data = savedResult();
  renderResult();
  state.actions.get('CLOSE ASSESSMENT')!();
  renderResult();
  state.options.get('Closure Reason')!.choose('OTHER');
  renderResult();
  state.actions.get('Confirm Close')!();
  expect(renderResult()).toContain('Enter a closure note of at least 10 characters.');
  expect(state.close).not.toHaveBeenCalled();
  state.inputs.get('Closure Note')!('  Site is now safe.  ');
  renderResult();
  let resolveClose!: (value: unknown) => void;
  state.close.mockImplementation(() => new Promise((resolve) => { resolveClose = resolve; }));
  const submit = state.actions.get('Confirm Close')!;
  submit();
  submit();
  expect(state.close).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledWith('assessment-active', {
    closureReason: 'OTHER', closureNote: 'Site is now safe.'
  }, 'officer-token');
  resolveClose({ assessment: assessment('CLOSED') });
  await Promise.resolve();
});

it('applies the closed response, hides active actions, and refreshes history', async () => {
  state.data = savedResult();
  renderResult();
  state.effects = [];
  state.actions.get('CLOSE ASSESSMENT')!();
  renderResult();
  state.close.mockResolvedValue({ assessment: assessment('CLOSED', { id: 'assessment-active', closureReason: 'INCIDENT_RESOLVED' }) });
  state.actions.get('Confirm Close')!();
  await Promise.resolve();
  const markup = renderResult();
  expect(markup).toContain('Saved assessment');
  expect(markup).toContain('CLOSED');
  expect(markup).toContain('Assessment closed');
  expect(markup).not.toContain('Create Warning');
  expect(markup).not.toContain('REASSESS RISK');
  expect(markup).not.toContain('CLOSE ASSESSMENT');
  expect(state.effects).toHaveLength(1);
  state.effects.at(-1)!();
  expect(state.history).toHaveBeenCalledWith('incident-1', 'officer-token');
});

it('does not show the previous close result after the mounted route loads another assessment', async () => {
  state.assessmentId = 'assessment-active';
  state.data = savedResult();
  renderResult();
  state.actions.get('CLOSE ASSESSMENT')!();
  renderResult();
  state.close.mockResolvedValue({ assessment: assessment('CLOSED', { id: 'assessment-active' }) });
  state.actions.get('Confirm Close')!();
  await Promise.resolve();
  expect(renderResult()).toContain('Saved assessment · CLOSED');

  state.assessmentId = 'assessment-other';
  const another = savedResult();
  another.assessment = assessment('ACTIVE', { id: 'assessment-other' });
  state.data = another;
  const markup = renderResult();
  expect(markup).toContain('Assessment Reference: assessment-other');
  expect(markup).toContain('Saved assessment · ACTIVE');
  expect(markup).toContain('CLOSE ASSESSMENT');
  expect(markup).not.toContain('Assessment closed.');
});

it('resets an open close form when the mounted route or session changes', () => {
  state.assessmentId = 'assessment-active';
  state.data = savedResult();
  renderResult();
  state.actions.get('CLOSE ASSESSMENT')!();
  renderResult();
  state.options.get('Closure Reason')!.choose('OTHER');
  renderResult();
  state.inputs.get('Closure Note')!('The old reason is private.');

  state.assessmentId = 'assessment-other';
  const other = savedResult();
  other.assessment = assessment('ACTIVE', { id: 'assessment-other' });
  state.data = other;
  expect(renderResult()).not.toContain('Confirm Close');
  state.actions.get('CLOSE ASSESSMENT')!();
  const otherForm = renderResult();
  expect(otherForm).toContain('selected: INCIDENT_RESOLVED');
  expect(otherForm).not.toContain('The old reason is private.');

  state.accessToken = 'another-session';
  expect(renderResult()).not.toContain('Confirm Close');
  state.actions.get('CLOSE ASSESSMENT')!();
  expect(renderResult()).toContain('selected: INCIDENT_RESOLVED');
});

it.each(['resolve', 'reject'] as const)('ignores an old close request that %s after switching routes', async (outcome) => {
  state.assessmentId = 'assessment-active';
  state.data = savedResult();
  renderResult();
  state.actions.get('CLOSE ASSESSMENT')!();
  renderResult();
  let resolveOld!: (value: unknown) => void;
  let rejectOld!: (reason: unknown) => void;
  state.close.mockImplementationOnce(() => new Promise((resolve, reject) => {
    resolveOld = resolve;
    rejectOld = reject;
  }));
  state.actions.get('Confirm Close')!();

  state.assessmentId = 'assessment-other';
  const other = savedResult();
  other.assessment = assessment('ACTIVE', { id: 'assessment-other' });
  state.data = other;
  renderResult();
  state.actions.get('CLOSE ASSESSMENT')!();
  renderResult();
  state.options.get('Closure Reason')!.choose('OTHER');
  renderResult();
  state.inputs.get('Closure Note')!('Current site needs monitoring.');
  renderResult();

  if (outcome === 'resolve') resolveOld({ assessment: assessment('CLOSED', { id: 'assessment-active' }) });
  else rejectOld(new ApiClientError(409, 'ASSESSMENT_NOT_ACTIVE', 'Old request conflict'));
  await Promise.resolve();
  const markup = renderResult();
  expect(markup).toContain('Saved assessment · ACTIVE');
  expect(markup).toContain('selected: OTHER');
  expect(markup).toContain('Current site needs monitoring.');
  expect(markup).not.toContain('Assessment closed.');
  expect(markup).not.toContain('Old request conflict');
  expect(markup).not.toContain('Refresh Assessment');
});

it('does not restore an old close form or submit again when returning to a pending assessment', async () => {
  state.assessmentId = 'assessment-active';
  state.data = savedResult();
  renderResult();
  state.actions.get('CLOSE ASSESSMENT')!();
  renderResult();
  state.options.get('Closure Reason')!.choose('OTHER');
  renderResult();
  state.inputs.get('Closure Note')!('Site is now safe.');
  renderResult();
  let resolveOld!: (value: unknown) => void;
  state.close.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const submitAgain = state.actions.get('Confirm Close')!;
  state.actions.get('Confirm Close')!();
  expect(state.close).toHaveBeenCalledOnce();

  state.assessmentId = 'assessment-other';
  const other = savedResult();
  other.assessment = assessment('ACTIVE', { id: 'assessment-other' });
  state.data = other;
  renderResult();
  state.assessmentId = 'assessment-active';
  state.data = savedResult();
  const returned = renderResult();
  expect(returned).not.toContain('Confirm Close');
  expect(returned).not.toContain('Site is now safe.');
  expect(returned).toContain('<button disabled="">CLOSE ASSESSMENT</button>');
  submitAgain();
  expect(state.close).toHaveBeenCalledOnce();

  resolveOld({ assessment: assessment('CLOSED', { id: 'assessment-active' }) });
  await Promise.resolve();
  const settled = renderResult();
  expect(settled).not.toContain('Assessment closed.');
  expect(settled).toContain('<button>CLOSE ASSESSMENT</button>');
});

it('keeps the selected reason and note after a failed close', async () => {
  state.data = savedResult();
  renderResult();
  state.actions.get('CLOSE ASSESSMENT')!();
  renderResult();
  state.options.get('Closure Reason')!.choose('OTHER');
  renderResult();
  state.inputs.get('Closure Note')!('  Site is now safe.  ');
  renderResult();
  state.close.mockRejectedValue(new Error('Network unavailable'));
  state.actions.get('Confirm Close')!();
  await Promise.resolve();
  const markup = renderResult();
  expect(markup).toContain('Network unavailable');
  expect(markup).toContain('selected: OTHER');
  expect(markup).toContain('Site is now safe.');
  expect(markup).not.toContain('Assessment closed');
});

it('offers a reload after a stale close conflict while retaining form values', async () => {
  state.data = savedResult();
  renderResult();
  state.actions.get('CLOSE ASSESSMENT')!();
  renderResult();
  state.options.get('Closure Reason')!.choose('OTHER');
  renderResult();
  state.inputs.get('Closure Note')!('Site is now safe.');
  renderResult();
  state.close.mockRejectedValue(new ApiClientError(409, 'ASSESSMENT_NOT_ACTIVE', 'Conflict'));
  state.actions.get('Confirm Close')!();
  await Promise.resolve();
  const markup = renderResult();
  expect(markup).toContain('Refresh to view the latest assessment');
  expect(markup).toContain('selected: OTHER');
  expect(markup).toContain('Site is now safe.');
  state.actions.get('Refresh Assessment')!();
  expect(state.reload).toHaveBeenCalledOnce();
});

it('offers the delete confirmation only for a CLOSED assessment', () => {
  state.data = savedResult();
  expect(renderResult()).not.toContain('DELETE ASSESSMENT');

  const closed = savedResult();
  closed.assessment = assessment('CLOSED');
  state.data = closed;
  expect(renderResult()).toContain('DELETE ASSESSMENT');
  state.actions.get('DELETE ASSESSMENT')!();
  const form = renderResult();
  expect(form).toContain('Delete assessment');
  expect(form).toContain('Delete Reason');
  expect(form).toContain('Delete Note');
  expect(form).toContain('Confirm Delete');
  expect(form).toContain('Cancel');
});

it('does not submit on cancel or without the required OTHER note', () => {
  const closed = savedResult();
  closed.assessment = assessment('CLOSED');
  state.data = closed;
  renderResult();
  state.actions.get('DELETE ASSESSMENT')!();
  renderResult();
  state.options.get('Delete Reason')!.choose('OTHER');
  renderResult();
  state.actions.get('Confirm Delete')!();
  expect(state.softDelete).not.toHaveBeenCalled();
  expect(renderResult()).toContain('delete note for OTHER');
  state.actions.get('Cancel')!();
  expect(renderResult()).not.toContain('Confirm Delete');
  expect(state.softDelete).not.toHaveBeenCalled();
});

it('blocks duplicate deletion submits and keeps the assessment visible on failure', async () => {
  const closed = savedResult();
  closed.assessment = assessment('CLOSED');
  state.data = closed;
  renderResult();
  state.actions.get('DELETE ASSESSMENT')!();
  renderResult();
  let resolveDelete!: (value: unknown) => void;
  state.softDelete.mockImplementationOnce(() => new Promise((resolve) => { resolveDelete = resolve; }));
  const submit = state.actions.get('Confirm Delete')!;
  submit();
  submit();
  expect(state.softDelete).toHaveBeenCalledOnce();
  resolveDelete({ assessment: assessment('CLOSED', { isDeleted: true }) });
  await Promise.resolve();
  renderResult();

  state.softDelete.mockRejectedValueOnce(new Error('Delete unavailable'));
  state.actions.get('DELETE ASSESSMENT')!();
  renderResult();
  state.actions.get('Confirm Delete')!();
  await Promise.resolve();
  const markup = renderResult();
  expect(markup).toContain('Delete unavailable');
  expect(markup).toContain('Saved assessment');
});

it('returns to the refreshed assessment list after a successful delete', async () => {
  const closed = savedResult();
  closed.assessment = assessment('CLOSED');
  state.data = closed;
  state.softDelete.mockResolvedValue({ assessment: assessment('CLOSED', { isDeleted: true }) });
  renderResult();
  state.actions.get('DELETE ASSESSMENT')!();
  renderResult();
  state.actions.get('Confirm Delete')!();
  await Promise.resolve();
  await Promise.resolve();

  expect(state.softDelete).toHaveBeenCalledWith('assessment-closed', { deleteReason: 'CREATED_BY_MISTAKE' }, 'officer-token');
  expect(state.replace).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/officer/assessments', params: expect.objectContaining({ refresh: expect.any(String) })
  }));
});
