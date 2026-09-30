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
  actions: new Map<string, () => void>(),
  push: vi.fn(), resetDraft: vi.fn(), reload: vi.fn(), listQueue: vi.fn(), geocode: vi.fn(), onRefresh: null as (() => void) | null
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({ children, accessibilityLabel, onPress }: { children?: ReactNode; accessibilityLabel?: string; onPress?: () => void }) => {
    if (accessibilityLabel && onPress) state.actions.set(accessibilityLabel, onPress);
    return <button onClick={onPress}>{children}</button>;
  },
  RefreshControl: (props: { onRefresh: () => void }) => { state.onRefresh = props.onRefresh; return null; },
  ActivityIndicator: () => <span>Spinner</span>,
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('expo-location', () => ({ reverseGeocodeAsync: state.geocode }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }), useLocalSearchParams: () => ({}), useFocusEffect: vi.fn() }));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'officer-token' }) }));
vi.mock('../assessment-flow/riskAssessmentDraft', () => ({ useRiskAssessmentDraft: () => ({ resetAssessmentDraft: state.resetDraft }) }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children, refreshControl }: { children?: ReactNode; refreshControl?: ReactNode }) => {
  return <main>{refreshControl}{children}</main>;
} }));
vi.mock('../../shared/components/StatusBadge', () => ({ StatusBadge: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: ({ name }: { name: string }) => <span>{name}</span> }));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress }: { label: string; onPress: () => void }) => { state.actions.set(label, onPress); return <button>{label}</button>; },
  AssessmentLoadState: ({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) => {
    state.actions.set('Try Again', retry);
    return <span>{loading ? 'Loading risk assessments...' : error ? 'Unable to load risk assessments.' : ''}</span>;
  },
  assessmentLabel: (value: string) => value.replace(/_/g, ' '), assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../hooks/useAssessmentResource', () => ({ useAssessmentResource: (loader: () => Promise<InitialAssessmentQueueResponse['incidents']>) => {
  state.loader = loader; return { data: state.data, loading: state.loading, error: state.error, reload: state.reload };
} }));
vi.mock('../api/incidentApi', () => ({ listInitialAssessmentQueue: state.listQueue }));

import { AssessmentQueueFilteredEmptyState, OfficerRiskAssessmentsScreen } from './OfficerRiskAssessmentsScreen';
import { resolveLocationLabel } from '../../shared/maps/locationLabel';

const eligible: InitialAssessmentQueueResponse['incidents'][number] = {
  incident: { id: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    reportIds: ['report-1'], status: 'ACTIVE', createdById: 'officer-1', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T11:00:00.000Z' },
  reports: [{ id: 'report-1', residentId: 'resident-1', hazardType: 'FLOOD', description: 'Verified source evidence', severity: 'HIGH',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] }, status: 'VERIFIED', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z' }]
};

beforeEach(() => {
  state.data = null; state.loading = false; state.error = null; state.loader = null; state.actions.clear();
  state.listQueue.mockReset(); state.push.mockReset(); state.resetDraft.mockReset(); state.reload.mockReset(); state.onRefresh = null;
});

it('shows a loading state while the queue is being fetched', () => {
  state.loading = true;
  expect(renderToStaticMarkup(<OfficerRiskAssessmentsScreen />)).toContain('Loading risk assessments...');
});

it('loads the existing queue endpoint and renders a compact accessible incident card', async () => {
  state.listQueue.mockResolvedValue({ incidents: [eligible] });
  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  await expect(state.loader!()).resolves.toEqual([eligible]);
  expect(state.listQueue).toHaveBeenCalledWith('officer-token');
  state.data = [eligible];
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('1 incident needs assessment');
  expect(markup).toContain('Flood');
  expect(markup).toContain('NEEDS ASSESSMENT');
  expect(markup).toContain('6.92710, 79.86120');
  expect(markup).toContain('1 verified report');
  expect(markup).toContain('View incident');
  expect(markup).toContain('All 1');
  expect(markup).toContain('Flood 1');
  expect(markup).not.toContain('Risk preparation belongs to this incident');
});

it('uses plural queue and report labels when multiple incidents and reports are loaded', () => {
  const second = { ...eligible, incident: { ...eligible.incident, id: 'incident-2' }, reports: [...eligible.reports, { ...eligible.reports[0], id: 'report-2' }] };
  state.data = [eligible, second];
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('2 incidents need assessment');
  expect(markup).toContain('2 verified reports');
});

it('clears the previous candidate draft and opens the overview with only incidentId', () => {
  state.data = [eligible];
  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  state.actions.get('View Flood incident overview')!();
  expect(state.resetDraft).toHaveBeenCalledOnce();
  expect(state.push).toHaveBeenCalledWith({ pathname: '/officer/assessments/incident/[incidentId]', params: { incidentId: 'incident-1' } });
});

it('uses pull-to-refresh and retries errors through the existing reload function', async () => {
  state.data = [eligible];
  renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  state.onRefresh!();
  state.onRefresh!();
  expect(state.reload).toHaveBeenCalledOnce();
  expect(state.reload).toHaveBeenCalledWith({ preserveData: true });
  expect(state.resetDraft).not.toHaveBeenCalled();
  await Promise.resolve();
  state.error = 'Queue unavailable';
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('Unable to load risk assessments.');
  expect(markup).not.toContain('Queue unavailable');
  state.actions.get('Try Again')!();
  expect(state.reload).toHaveBeenCalledTimes(2);
});

it('shows a filtered empty state with Show all action', () => {
  const showAll = vi.fn();
  const markup = renderToStaticMarkup(<AssessmentQueueFilteredEmptyState hazard="LANDSLIDE" onShowAll={showAll} />);
  expect(markup).toContain('No matching incidents');
  expect(markup).toContain('There are no Landslide incidents waiting for assessment.');
  expect(markup).toContain('Show all');
  state.actions.get('Show all')!();
  expect(showAll).toHaveBeenCalledOnce();
});

it('shows All caught up for an empty queue and keeps pull-to-refresh available', () => {
  state.data = [];
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('0 incidents need assessment');
  expect(markup).toContain('All caught up');
  expect(markup).toContain('There are no incidents waiting for an initial risk assessment.');
  expect(state.onRefresh).toBeTypeOf('function');
});

it('keeps cards usable while location is pending and displays the resolved name once available', async () => {
  const location = { type: 'Point' as const, coordinates: [79.94, 6.83] as [number, number] };
  let finish!: (value: object[]) => void;
  state.geocode.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  state.data = [{ ...eligible, incident: { ...eligible.incident, location } }];
  const pending = resolveLocationLabel(location);
  const markup = renderToStaticMarkup(<OfficerRiskAssessmentsScreen />);
  expect(markup).toContain('6.83000, 79.94000');
  state.actions.get('View Flood incident overview')!();
  expect(state.push).toHaveBeenCalledOnce();
  finish([{ city: 'Colombo', region: 'Western Province' }]);
  await pending;
  expect(renderToStaticMarkup(<OfficerRiskAssessmentsScreen />)).toContain('Colombo, Western Province');
});
