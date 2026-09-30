import React, { type ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IncidentOverview } from '../api/incidentOverview';
import { createInitialAssessmentDraft, type RiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraftState';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({
  incidentId: 'incident-1', data: null as IncidentOverview | null, loading: false, error: null as string | null,
  draft: null as RiskAssessmentDraft | null, initialize: vi.fn(), reset: vi.fn(), push: vi.fn(), dismissTo: vi.fn(),
  reload: vi.fn(), load: vi.fn(), loader: null as (() => Promise<IncidentOverview>) | null,
  actions: new Map<string, () => void | Promise<void>>(), disabled: new Map<string, boolean>(),
  hooks: [] as unknown[], index: 0, refs: [] as { current: unknown }[], refIndex: 0,
  focus: null as (() => (() => void)) | null, map: vi.fn()
}));
vi.mock('react', async (importOriginal) => ({ ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (index >= state.hooks.length) state.hooks[index] = initial;
    return [state.hooks[index], (value: unknown) => { state.hooks[index] = typeof value === 'function' ? Reflect.apply(value, undefined, [state.hooks[index]]) : value; }];
  },
  useRef: (initial: unknown) => {
    const index = state.refIndex++;
    if (index >= state.refs.length) state.refs[index] = { current: initial };
    return state.refs[index];
  }
}));
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({ children, accessibilityLabel, onPress }: { children?: ReactNode; accessibilityLabel: string; onPress: () => void }) => {
    state.actions.set(accessibilityLabel, onPress); return <button>{children}</button>;
  }, StyleSheet: { create: (value: unknown) => value }
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ incidentId: state.incidentId }),
  useRouter: () => ({ push: state.push, dismissTo: state.dismissTo }),
  useFocusEffect: (effect: () => () => void) => { state.focus = effect; }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'token' }) }));
vi.mock('../assessment-flow/riskAssessmentDraft', () => ({ useRiskAssessmentDraft: () => ({
  draft: state.draft, initializeInitialAssessment: state.initialize, resetAssessmentDraft: state.reset
}) }));
vi.mock('../api/incidentOverview', () => ({ loadIncidentOverview: state.load,
  NO_VERIFIED_INCIDENT_EVIDENCE: 'This incident has no verified reports available. Return to Assessments for the latest queue.'
}));
vi.mock('../hooks/useAssessmentResource', () => ({ useAssessmentResource: (loader: () => Promise<IncidentOverview>) => {
  state.loader = loader; return { data: state.data, loading: state.loading, error: state.error, reload: state.reload };
} }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/components/StatusBadge', () => ({ StatusBadge: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('../../shared/maps/HumanReadableLocation', () => ({ HumanReadableLocation: () => <span>Resolved locality</span> }));
vi.mock('../../shared/maps/LocationPreview', () => ({ LocationPreview: (props: unknown) => { state.map(props); return <span>Map preview</span>; } }));
vi.mock('../components/VerifiedReportAccordion', () => ({ VerifiedReportAccordion: () => <span>Verified Report</span> }));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) => {
    state.actions.set(label, onPress); state.disabled.set(label, disabled); return <button disabled={disabled}>{label}</button>;
  },
  AssessmentLoadState: ({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) => {
    state.actions.set('Retry', retry); return <span>{loading ? 'Loading' : error}</span>;
  }, assessmentStyles: new Proxy({}, { get: () => undefined })
}));
import { IncidentOverviewScreen } from './IncidentOverviewScreen';
const context: IncidentOverview = {
  assessment: null, canStartInitialAssessment: true,
  incident: { id: 'incident-1', hazardType: 'BLOCKED_ROAD', location: { type: 'Point', coordinates: [79.94, 6.83] },
    reportIds: ['report-1'], status: 'ACTIVE', createdById: 'officer-1', createdAt: '2026-09-25', updatedAt: '2026-09-25' },
  reports: [{ id: 'report-1', residentId: 'resident-1', hazardType: 'BLOCKED_ROAD', description: 'Tree across road.', severity: 'HIGH',
    location: { type: 'Point', coordinates: [79.94, 6.83] }, status: 'VERIFIED', createdAt: '2026-09-25', updatedAt: '2026-09-25' }]
};
function render() { state.index = 0; state.refIndex = 0; state.actions.clear(); state.disabled.clear(); return renderToStaticMarkup(<IncidentOverviewScreen />); }
beforeEach(() => {
  state.incidentId = 'incident-1'; state.data = context; state.loading = false; state.error = null; state.draft = null;
  state.hooks = []; state.refs = []; state.index = 0; state.refIndex = 0;
  for (const mock of [state.initialize, state.reset, state.push, state.dismissTo, state.reload, state.load, state.map]) mock.mockReset();
  state.reload.mockResolvedValue(context); state.load.mockResolvedValue(context);
});
it('loads the requested incident and renders summary, verified count, evidence, and the correct map coordinates', async () => {
  const markup = render();
  await state.loader!();
  expect(state.load).toHaveBeenCalledWith('incident-1', 'token');
  expect(markup).toContain('Blocked Road Incident');
  expect(markup).toContain('NEEDS ASSESSMENT');
  expect(markup).toContain('1 verified report');
  expect(markup).toContain('Latest evidence');
  expect(markup).toMatch(/ago|yesterday|just now/);
  expect(markup).toContain('Resolved locality');
  expect(markup).toContain('Verified Reports (1)');
  expect(markup).toContain('High (1)');
  expect(markup).not.toContain('report-1');
  expect(state.map).toHaveBeenCalledWith(expect.objectContaining({ coordinates: { latitude: 6.83, longitude: 79.94 }, height: 200 }));
});
it('renders loading and a retryable error without enabling Start', () => {
  state.data = null; state.loading = true;
  expect(render()).toContain('Loading');
  state.loading = false; state.error = 'HTTP failure internals';
  const markup = render();
  expect(markup).toContain('Unable to load incident');
  expect(markup).not.toContain('HTTP failure internals');
  state.actions.get('Retry')!();
  expect(state.reload).toHaveBeenCalledOnce();
  expect(state.actions.has('START ASSESSMENT')).toBe(false);
});
it('revalidates Start, initializes a new INITIAL draft, and routes with only incidentId', async () => {
  render();
  expect(state.initialize).not.toHaveBeenCalled();
  await state.actions.get('START ASSESSMENT')!();
  expect(state.reload).toHaveBeenCalledWith({ preserveData: true });
  expect(state.initialize).toHaveBeenCalledWith('incident-1');
  expect(state.push).toHaveBeenCalledWith({ pathname: '/officer/assessments/create', params: { incidentId: 'incident-1' } });
});
it('preserves the matching draft across focus, rerender, and Start again after returning from the form', async () => {
  state.draft = { ...createInitialAssessmentDraft('incident-1'), decisionReason: 'Keep this decision', factors: { ...createInitialAssessmentDraft('incident-1').factors, peopleAffected: '42' } };
  render(); state.focus!(); render();
  await state.actions.get('START ASSESSMENT')!();
  expect(state.initialize).not.toHaveBeenCalled(); expect(state.reset).not.toHaveBeenCalled();
  expect(state.draft.factors.peopleAffected).toBe('42');
});
it('returns to the existing queue and explicitly abandons the candidate', () => {
  render(); state.actions.get('Back to Risk Assessments')!();
  expect(state.dismissTo).toHaveBeenCalledWith('/officer/assessments');
  expect(state.reset).toHaveBeenCalledOnce();
});
it('blocks a candidate that becomes ineligible while Start revalidates', async () => {
  state.reload.mockResolvedValue({ ...context, canStartInitialAssessment: false });
  render(); await state.actions.get('START ASSESSMENT')!();
  expect(state.push).not.toHaveBeenCalled(); expect(state.initialize).not.toHaveBeenCalled();
});
it('blocks missing verified evidence and offers monitoring for stale incidents', () => {
  state.data = { ...context, reports: [], canStartInitialAssessment: false };
  expect(render()).toContain('no verified reports');
  expect(state.disabled.get('START ASSESSMENT')).toBe(true);
});
it('shows a current assessment action instead of allowing another initial assessment', async () => {
  state.data = { ...context, canStartInitialAssessment: false, assessment: { id: 'assessment-1' } as NonNullable<IncidentOverview['assessment']> };
  render();
  expect(state.disabled.get('START ASSESSMENT')).toBe(true);
  await state.actions.get('START ASSESSMENT')!();
  expect(state.reload).not.toHaveBeenCalled();
  state.actions.get('View assessment')!();
  expect(state.push).toHaveBeenCalledWith({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: 'assessment-1' } });
});
it('ignores repeated Start presses and late revalidation after leaving the overview', async () => {
  let finish!: (value: IncidentOverview) => void;
  state.reload.mockReturnValue(new Promise<IncidentOverview>((resolve) => { finish = resolve; }));
  render(); const blur = state.focus!();
  const pending = state.actions.get('START ASSESSMENT')!();
  await state.actions.get('START ASSESSMENT')!();
  expect(state.reload).toHaveBeenCalledOnce();
  blur(); finish(context); await pending;
  expect(state.initialize).not.toHaveBeenCalled(); expect(state.push).not.toHaveBeenCalled();
});
