import * as React from 'react';
import type { SafeResponseRequest, UserRole } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MyEmergencyRequestsRoute from '../../../../../app/resident/my-emergency-requests';
import ResidentEmergencyRequestDetailsRoute from '../../../../../app/resident/emergency-request/[requestId]';
import ResidentLayout from '../../../../../app/resident/_layout';
import { RoleRouteLayout } from '../../../auth/screens/RoleRouteLayout';
import { getMyResponseRequestById, listMyResponseRequests } from '../api/responseRequestApi';
import { ApiClientError, apiBaseUrl } from '../../../../services/api/client';
import { EmergencyRequestSummaryCard } from '../components/EmergencyRequestSummaryCard';
import { EmergencyRequestStatePanel } from '../components/EmergencyRequestStatePanel';
import { formatResidentReportDateTime } from '../reports';
import { EmergencyAssistanceDraftProvider, useEmergencyAssistanceDraft } from '../emergencyAssistanceDraft';
import { residentBottomNavItems, residentPrimaryActions } from '../mockData';
import { EmergencyAssistanceScreen } from './EmergencyAssistanceScreen';
import { EmergencyRequestSubmittedScreen } from './EmergencyRequestSubmittedScreen';
import { MyEmergencyRequestsScreen } from './MyEmergencyRequestsScreen';
import { ResidentEmergencyRequestDetailsScreen } from './ResidentEmergencyRequestDetailsScreen';

// Follow the existing mobile tests: exercise focus/blur and refresh callbacks without a native runtime.
const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  params: {} as { requestId?: string | string[] },
  effect: (() => undefined) as () => (() => void) | undefined
}));
const navigation = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), canGoBack: vi.fn() }));
const auth = vi.hoisted(() => ({
  accessToken: 'resident-token' as string | null,
  status: 'authenticated', user: { id: 'resident-1', role: 'RESIDENT' as UserRole }
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => {
    const index = lifecycle.cursor++;
    lifecycle.slots[index] ??= { current: initial };
    return lifecycle.slots[index];
  },
  useEffect: (callback: typeof lifecycle.effect) => { lifecycle.effect = callback; },
  useState: (initial: unknown) => {
    const index = lifecycle.cursor++;
    if (!(index in lifecycle.slots)) lifecycle.slots[index] = initial;
    return [lifecycle.slots[index], (value: unknown) => { lifecycle.slots[index] = value; }];
  }
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (callback: typeof lifecycle.effect) => { lifecycle.effect = callback; },
  useRouter: () => navigation, useLocalSearchParams: () => lifecycle.params,
  Redirect: 'redirect', Stack: 'stack'
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'span', Pressable: 'button', Text: 'span', View: 'div', TextInput: 'input',
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../../auth/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('../../shared/currentLocation', () => ({ captureCurrentLocation: vi.fn(), formatCoordinate: vi.fn() }));
vi.mock('../api/responseRequestApi', () => ({ listMyResponseRequests: vi.fn(), getMyResponseRequestById: vi.fn() }));
vi.mock('../reportDraft', () => ({ ReportHazardDraftProvider: 'report-provider' }));
vi.mock('../emergencyAssistanceDraft', async (importOriginal) => ({
  ...await importOriginal<typeof import('../emergencyAssistanceDraft')>(),
  useEmergencyAssistanceDraft: vi.fn()
}));

const request: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011', residentId: 'resident-1', status: 'NEW',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 1, medicalNeeds: true, injuredPeople: 1,
  vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'ACCESSIBLE', contact: { name: 'Resident', phoneNumber: '+94-77-555-1234' },
  description: 'Medical assistance needed.',
  createdAt: '2026-09-24T10:00:00.000Z', updatedAt: '2026-09-24T10:00:00.000Z'
};

const detailedRequest: SafeResponseRequest = {
  ...request, status: 'IN_PROGRESS', affectedPeople: 7, injuredPeople: 2,
  vulnerablePeople: { children: 3, elderlyPeople: 1, personsWithDisabilities: 2, pregnantPersons: 0 },
  roadAccessibility: 'LIMITED',
  description: 'Water has entered the house.',
  specialRequirements: 'Wheelchair-accessible transport required.',
  contact: { name: 'Resident Contact', phoneNumber: '+94-77-555-1234', email: 'resident@example.test' }
};

function render() {
  lifecycle.cursor = 0;
  return MyEmergencyRequestsScreen();
}

function screenText(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(screenText).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return '';
  if (typeof node.type === 'function') {
    return screenText((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  return screenText(node.props.children);
}

function summaryCards(node: React.ReactNode): React.ReactElement<{ request: SafeResponseRequest }>[] {
  if (Array.isArray(node)) return node.flatMap(summaryCards);
  if (!React.isValidElement<{ children?: React.ReactNode; request: SafeResponseRequest }>(node)) return [];
  return node.type === EmergencyRequestSummaryCard ? [node] : summaryCards(node.props.children);
}

function press(node: React.ReactNode, label: string): boolean {
  if (Array.isArray(node)) return node.some((child) => press(child, label));
  if (!React.isValidElement<{ children?: React.ReactNode; accessibilityLabel?: string; onPress?: () => void }>(node)) return false;
  if (typeof node.type === 'function') {
    return press((node.type as (props: unknown) => React.ReactNode)(node.props), label);
  }
  if (node.props.onPress && (node.props.accessibilityLabel === label || screenText(node.props.children) === label)) {
    node.props.onPress();
    return true;
  }
  return press(node.props.children, label);
}

beforeEach(() => {
  vi.clearAllMocks();
  lifecycle.slots = [];
  lifecycle.cursor = 0;
  lifecycle.params = { requestId: request.id };
  auth.accessToken = 'resident-token';
  auth.status = 'authenticated';
  auth.user.role = 'RESIDENT';
  navigation.canGoBack.mockReturnValue(true);
  vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [] });
  vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: detailedRequest });
  // Read the existing provider's initial draft so navigation tests don't duplicate form defaults.
  const provider = EmergencyAssistanceDraftProvider({ children: null });
  vi.mocked(useEmergencyAssistanceDraft).mockReturnValue(provider.props.value);
  lifecycle.slots = [];
  lifecycle.cursor = 0;
});

afterEach(() => vi.unstubAllGlobals());

describe('Resident tracking HTTP-client and reload validation', () => {
  async function useRealResidentApi() {
    // Keep native rendering mocked, but exercise the production API adapter, bearer headers and response validation.
    const api = await vi.importActual<typeof import('../api/responseRequestApi')>('../api/responseRequestApi');
    vi.mocked(listMyResponseRequests).mockImplementation(api.listMyResponseRequests);
    vi.mocked(getMyResponseRequestById).mockImplementation(api.getMyResponseRequestById);
  }

  it.each(['list', 'details'] as const)('renders all server statuses through the real %s client and rereads after unmount', async (screen) => {
    await useRealResidentApi();
    let serverResponse: SafeResponseRequest = { ...detailedRequest, status: 'NEW' };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(
      screen === 'list' ? { responseRequests: [serverResponse] } : { responseRequest: serverResponse }
    ));
    vi.stubGlobal('fetch', fetchMock);
    const renderScreen = screen === 'list' ? render : renderDetails;
    renderScreen();
    let cleanup = lifecycle.effect();
    const statuses = [
      ['NEW', 'Submitted'], ['ASSIGNED', 'Assigned'], ['DISPATCHED', 'Dispatched'],
      ['ARRIVED', 'Arrived'], ['IN_PROGRESS', 'In Progress'], ['COMPLETED', 'Completed']
    ] as const;

    for (const [status, label] of statuses) {
      serverResponse = { ...serverResponse, status };
      if (status !== 'NEW') {
        press(renderScreen(), screen === 'list' ? 'Refresh emergency requests' : 'Refresh emergency request details');
      }
      await vi.waitFor(() => expect(screenText(renderScreen())).toContain(`Status:  ${label}`));
      expect(screenText(renderScreen())).not.toContain(status);
      if (screen === 'details') expect(screenText(renderScreen())).toContain(`${label} Current stage`);

      if (status === 'IN_PROGRESS' || status === 'COMPLETED') {
        const readsBeforeReload = fetchMock.mock.calls.length;
        cleanup?.();
        // Discard all component state to model closing/reloading, not merely rerendering cached data.
        lifecycle.slots = [];
        expect(screenText(renderScreen())).toContain('Loading');
        cleanup = lifecycle.effect();
        await vi.waitFor(() => expect(screenText(renderScreen())).toContain(`Status:  ${label}`));
        expect(fetchMock).toHaveBeenCalledTimes(readsBeforeReload + 1);
      }
    }
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/response-requests/mine${screen === 'details' ? `/${request.id}` : ''}`,
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer resident-token' }) })
    );
    cleanup?.();
  });

  it('drops previously visible details when a manually changed route is denied by the secure endpoint', async () => {
    await useRealResidentApi();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ responseRequest: detailedRequest }))
      .mockResolvedValueOnce(Response.json({ error: { code: 'REQUEST_NOT_FOUND', message: 'Emergency request not found.' } }, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    renderDetails();
    const cleanup = lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain(detailedRequest.description));
    cleanup?.();
    lifecycle.params = { requestId: '507f1f77bcf86cd799439012' };
    expect(screenText(renderDetails())).not.toContain(detailedRequest.description);
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('This emergency request is unavailable.'));
    expect(screenText(renderDetails())).not.toContain(detailedRequest.contact.phoneNumber);
    expect(fetchMock).toHaveBeenLastCalledWith(`${apiBaseUrl}/response-requests/mine/507f1f77bcf86cd799439012`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer resident-token' }) }));
  });

  it.each(['network', 'malformed', 'expired'] as const)('handles a real-client %s failure and recovers with a fresh read', async (failure) => {
    await useRealResidentApi();
    const fetchMock = vi.fn<typeof fetch>();
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('Internal network configuration'));
    else if (failure === 'malformed') fetchMock.mockResolvedValueOnce(Response.json({ responseRequest: null }));
    else fetchMock.mockResolvedValueOnce(Response.json({ error: { code: 'INVALID_TOKEN', message: 'Internal token details' } }, { status: 401 }));
    fetchMock.mockImplementation(async () => Response.json({ responseRequest: detailedRequest }));
    vi.stubGlobal('fetch', fetchMock);
    renderDetails();
    const cleanup = lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Unable to load request details'));
    expect(screenText(renderDetails())).not.toContain('Internal');
    if (failure === 'expired') {
      expect(screenText(renderDetails())).toContain('Please log in again.');
      // Session renewal is owned by the existing auth flow, not by Retry.
      cleanup?.();
      auth.accessToken = 'renewed-resident-token';
      renderDetails();
      lifecycle.effect();
    } else {
      press(renderDetails(), 'Retry');
    }
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('In Progress Current stage'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(`${apiBaseUrl}/response-requests/mine/${detailedRequest.id}`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${auth.accessToken}` }) }));
  });
});

function statePanel(node: React.ReactNode): React.ComponentProps<typeof EmergencyRequestStatePanel> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const panel = statePanel(child);
      if (panel) return panel;
    }
    return undefined;
  }
  if (!React.isValidElement<React.ComponentProps<typeof EmergencyRequestStatePanel> & { children?: React.ReactNode }>(node)) return undefined;
  return node.type === EmergencyRequestStatePanel ? node.props : statePanel(node.props.children);
}

describe('Resident tracking loading, empty and retry states', () => {
  it('shows loading with an indicator until a successful empty result arrives', async () => {
    let resolve: ((value: { responseRequests: SafeResponseRequest[] }) => void) | undefined;
    vi.mocked(listMyResponseRequests).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render();
    lifecycle.effect();
    expect(statePanel(render())?.loading).toBe(true);
    expect(screenText(render())).toContain('Loading your emergency requests');
    expect(screenText(render())).not.toContain('You have no emergency assistance requests yet.');
    expect(press(render(), 'Retry')).toBe(false);
    resolve?.({ responseRequests: [] });
    await vi.waitFor(() => expect(screenText(render())).toContain('You have no emergency assistance requests yet.'));
    expect(screenText(render())).toContain('Your submitted emergency assistance requests will appear here.');
    expect(screenText(render())).not.toContain('Loading');
    expect(press(render(), 'Retry')).toBe(false);
  });

  it.each([false, true])('retries the list and replaces its error with successful content (empty: %s)', async (empty) => {
    vi.mocked(listMyResponseRequests).mockRejectedValueOnce(new Error('MongoError: private database host'));
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('Unable to load requests'));
    expect(screenText(render())).not.toContain('MongoError');
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: empty ? [] : [request] });
    expect(press(render(), 'Retry')).toBe(true);
    expect(statePanel(render())?.loading).toBe(true);
    expect(screenText(render())).not.toContain('Unable to load requests');
    await vi.waitFor(() => expect(screenText(render())).toContain(
      empty ? 'Your submitted emergency assistance requests will appear here.' : 'Medical Assistance'
    ));
    expect(summaryCards(render())).toHaveLength(empty ? 0 : 1);
    expect(listMyResponseRequests).toHaveBeenCalledTimes(2);
    expect(press(render(), 'Retry')).toBe(false);
  });

  it('retries the selected details request and displays its latest status and progress', async () => {
    vi.mocked(getMyResponseRequestById).mockRejectedValueOnce(new Error('TypeError: internal stack'));
    renderDetails();
    lifecycle.effect();
    expect(statePanel(renderDetails())?.loading).toBe(true);
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Unable to load request details'));
    expect(screenText(renderDetails())).not.toContain('TypeError');
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...detailedRequest, status: 'ARRIVED' } });
    expect(press(renderDetails(), 'Retry')).toBe(true);
    expect(statePanel(renderDetails())?.loading).toBe(true);
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Arrived Current stage'));
    expect(screenText(renderDetails())).toContain('Status:  Arrived');
    expect(getMyResponseRequestById).toHaveBeenCalledTimes(2);
    expect(getMyResponseRequestById).toHaveBeenLastCalledWith(request.id, 'resident-token');
  });

  it.each(['list', 'details'] as const)('retains a friendly error and working Retry after repeated %s failures', async (screen) => {
    vi.mocked(listMyResponseRequests).mockRejectedValue(new Error('Internal API details'));
    vi.mocked(getMyResponseRequestById).mockRejectedValue(new Error('Internal API details'));
    const renderScreen = screen === 'list' ? render : renderDetails;
    renderScreen();
    lifecycle.effect();
    await vi.waitFor(() => expect(statePanel(renderScreen())?.onRetry).toBeDefined());
    press(renderScreen(), 'Retry');
    expect(statePanel(renderScreen())?.loading).toBe(true);
    await vi.waitFor(() => expect(statePanel(renderScreen())?.onRetry).toBeDefined());
    expect(screenText(renderScreen())).not.toContain('Internal API details');
    expect(screenText(renderScreen())).toContain('Unable to load');
    expect(screen === 'list' ? listMyResponseRequests : getMyResponseRequestById).toHaveBeenCalledTimes(2);
  });

  it.each(['list', 'details'] as const)('coalesces rapid Retry and Refresh taps for %s before a rerender', async (screen) => {
    const renderScreen = screen === 'list' ? render : renderDetails;
    if (screen === 'list') vi.mocked(listMyResponseRequests).mockRejectedValueOnce(new Error('Offline'));
    else vi.mocked(getMyResponseRequestById).mockRejectedValueOnce(new Error('Offline'));
    renderScreen();
    lifecycle.effect();
    await vi.waitFor(() => expect(statePanel(renderScreen())?.onRetry).toBeDefined());
    const errorScreen = renderScreen();
    let resolve: (() => void) | undefined;
    if (screen === 'list') {
      vi.mocked(listMyResponseRequests).mockReturnValueOnce(new Promise((done) => {
        resolve = () => done({ responseRequests: [request] });
      }));
    } else {
      vi.mocked(getMyResponseRequestById).mockReturnValueOnce(new Promise((done) => {
        resolve = () => done({ responseRequest: detailedRequest });
      }));
    }
    press(errorScreen, 'Retry');
    press(errorScreen, 'Retry');
    press(errorScreen, screen === 'list' ? 'Refresh emergency requests' : 'Refresh emergency request details');
    expect(screen === 'list' ? listMyResponseRequests : getMyResponseRequestById).toHaveBeenCalledTimes(2);
    expect(statePanel(renderScreen())?.loading).toBe(true);
    resolve?.();
    await vi.waitFor(() => expect(screenText(renderScreen())).toContain('Medical Assistance'));
  });

  it('does not offer a no-op Retry for missing authentication or invalid details identifiers', () => {
    auth.accessToken = null;
    expect(press(render(), 'Retry')).toBe(false);
    expect(screenText(render())).toContain('Please log in again.');
    auth.accessToken = 'resident-token';
    lifecycle.params = { requestId: 'invalid' };
    expect(press(renderDetails(), 'Retry')).toBe(false);
    expect(screenText(renderDetails())).toContain('Select a valid request');
    lifecycle.effect();
    expect(getMyResponseRequestById).not.toHaveBeenCalled();
  });

  it('announces loading and keeps Retry separate and accessible', () => {
    const loading = EmergencyRequestStatePanel({ title: 'Loading requests', loading: true });
    const content = loading.props.children[0];
    expect(content.props.accessibilityState).toEqual({ busy: true });
    expect(content.props.accessibilityLiveRegion).toBe('polite');
    const retry = vi.fn();
    const error = EmergencyRequestStatePanel({ title: 'Unable to load requests', onRetry: retry });
    expect(error.props.children[1].props.accessibilityRole).toBe('button');
    press(error, 'Retry');
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('Resident status refetch', () => {
  const statuses = [
    ['NEW', 'Submitted'], ['ASSIGNED', 'Assigned'], ['DISPATCHED', 'Dispatched'],
    ['ARRIVED', 'Arrived'], ['IN_PROGRESS', 'In Progress'], ['COMPLETED', 'Completed']
  ] as const;

  it('replaces summary card data with each newly retrieved backend status after Refresh', async () => {
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [request] });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(summaryCards(render())).toHaveLength(1));

    for (const [status, label] of statuses) {
      vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [{ ...request, status }] });
      expect(press(render(), 'Refresh emergency requests')).toBe(true);
      await vi.waitFor(() => expect(screenText(render())).toContain(`Status:  ${label}`));
      expect(summaryCards(render())[0].props.request.status).toBe(status);
      expect(screenText(render())).not.toContain('IN_PROGRESS');
    }
    expect(listMyResponseRequests).toHaveBeenCalledTimes(statuses.length + 1);
    expect(listMyResponseRequests).toHaveBeenLastCalledWith('resident-token');
  });

  it('keeps the details heading and tracker on the same refetched request status', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...detailedRequest, status: 'NEW' } });
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Submitted Current stage'));

    for (const [status, label] of statuses) {
      vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...detailedRequest, status } });
      expect(press(renderDetails(), 'Refresh emergency request details')).toBe(true);
      await vi.waitFor(() => expect(screenText(renderDetails())).toContain(`${label} Current stage`));
      expect(screenText(renderDetails())).toContain(`Status:  ${label}`);
      expect(screenText(renderDetails())).not.toContain('IN_PROGRESS');
    }
    expect(getMyResponseRequestById).toHaveBeenCalledTimes(statuses.length + 1);
    expect(getMyResponseRequestById).toHaveBeenLastCalledWith(request.id, 'resident-token');
  });

  it.each(['list', 'details'] as const)('refetches a still-mounted %s screen on return to focus', async (screen) => {
    const renderScreen = screen === 'list' ? render : renderDetails;
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [{ ...request, status: 'ASSIGNED' }] });
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...detailedRequest, status: 'ASSIGNED' } });
    renderScreen();
    const blur = lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderScreen())).toContain('Status:  Assigned'));
    blur?.();

    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [{ ...request, status: 'DISPATCHED' }] });
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...detailedRequest, status: 'DISPATCHED' } });
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderScreen())).toContain('Status:  Dispatched'));
    expect(screenText(renderScreen())).not.toContain('Status:  Assigned');
  });

  it.each(['list', 'details'] as const)('ignores an older %s response that arrives after a newer read', async (screen) => {
    let resolveList: ((value: { responseRequests: SafeResponseRequest[] }) => void) | undefined;
    let resolveDetails: ((value: { responseRequest: SafeResponseRequest }) => void) | undefined;
    if (screen === 'list') {
      vi.mocked(listMyResponseRequests).mockReturnValueOnce(new Promise((done) => { resolveList = done; }));
    } else {
      vi.mocked(getMyResponseRequestById).mockReturnValueOnce(new Promise((done) => { resolveDetails = done; }));
    }
    const renderScreen = screen === 'list' ? render : renderDetails;
    renderScreen();
    const blur = lifecycle.effect();
    blur?.();

    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [{ ...request, status: 'ARRIVED' }] });
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...detailedRequest, status: 'ARRIVED' } });
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderScreen())).toContain('Status:  Arrived'));
    if (screen === 'list') resolveList?.({ responseRequests: [{ ...request, status: 'ASSIGNED' }] });
    else resolveDetails?.({ responseRequest: { ...detailedRequest, status: 'ASSIGNED' } });
    await Promise.resolve();
    expect(screenText(renderScreen())).toContain('Status:  Arrived');
    expect(screenText(renderScreen())).not.toContain('Status:  Assigned');
  });

  it.each(['list', 'details'] as const)('does not present stale %s status as current after a failed refresh', async (screen) => {
    const renderScreen = screen === 'list' ? render : renderDetails;
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [request] });
    renderScreen();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderScreen())).toContain('Status:'));
    vi.mocked(listMyResponseRequests).mockRejectedValue(new Error('Internal database information'));
    vi.mocked(getMyResponseRequestById).mockRejectedValue(new ApiClientError(404, 'REQUEST_NOT_FOUND', 'Private owner data'));
    press(renderScreen(), screen === 'list' ? 'Refresh emergency requests' : 'Refresh emergency request details');
    await vi.waitFor(() => expect(screenText(renderScreen())).toContain(
      screen === 'list' ? 'Unable to load your emergency requests right now.' : 'This emergency request is unavailable.'
    ));
    expect(screenText(renderScreen())).not.toContain('Status:');
    expect(screenText(renderScreen())).not.toContain('Internal database');
    expect(screenText(renderScreen())).not.toContain('Private owner');
  });
});

describe('My Emergency Requests foundation', () => {
  it('renders the dedicated screen and loads through the resident service', async () => {
    expect(MyEmergencyRequestsRoute().type).toBe(MyEmergencyRequestsScreen);
    expect(screenText(render())).toContain('My Emergency Requests');
    expect(screenText(render())).toContain('Track the progress of your emergency assistance requests.');
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('You have no emergency assistance requests yet.'));
    expect(listMyResponseRequests).toHaveBeenCalledExactlyOnceWith('resident-token');
  });

  it('renders one summary card from the existing authenticated service', async () => {
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [request] });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('1 emergency assistance request submitted.'));
    const cards = summaryCards(render());
    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe(request.id);
    expect(cards[0].props.request).toBe(request);
    expect(screenText(cards[0])).toContain('Medical Assistance');
    expect(screenText(cards[0])).toContain(`Submitted:  ${formatResidentReportDateTime(request.createdAt)}`);
    expect(screenText(cards[0])).toContain('Status:  Submitted');
    expect(screenText(cards[0])).not.toContain(request.createdAt);
    expect(listMyResponseRequests).toHaveBeenCalledExactlyOnceWith('resident-token');
    const card = EmergencyRequestSummaryCard(cards[0].props);
    expect(card.props.accessibilityRole).toBe('button');
    expect(screenText(card)).toContain('View Details');
    expect(press(card, card.props.accessibilityLabel)).toBe(true);
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/resident/emergency-request/[requestId]', params: { requestId: request.id }
    });
  });

  it('renders multiple requests in API order with readable status labels', async () => {
    const requests: SafeResponseRequest[] = [
      { ...request, id: 'in-progress', status: 'IN_PROGRESS', assistanceType: 'RESCUE_EVACUATION' },
      { ...request, id: 'completed', status: 'COMPLETED', createdAt: '2026-09-20T10:00:00.000Z' },
      { ...request, id: 'assigned', status: 'ASSIGNED' },
      { ...request, id: 'dispatched', status: 'DISPATCHED' },
      { ...request, id: 'arrived', status: 'ARRIVED' }
    ];
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: requests });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(summaryCards(render())).toHaveLength(requests.length));
    const cards = summaryCards(render());
    expect(cards.map((card) => card.props.request.id)).toEqual(requests.map((item) => item.id));
    expect(cards.map((card) => screenText(card).split('Status:  ')[1].trim())).toEqual([
      'In Progress', 'Completed', 'Assigned', 'Dispatched', 'Arrived'
    ]);
    expect(screenText(cards[0])).toContain('Rescue / Evacuation');
    expect(screenText(render())).not.toContain('IN_PROGRESS');
  });

  it('keeps incomplete summaries readable with unique fallback keys and no fake action', async () => {
    const incomplete = { ...request, id: undefined, status: 'UNKNOWN', assistanceType: null, createdAt: null } as unknown as SafeResponseRequest;
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [incomplete, incomplete] });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(summaryCards(render())).toHaveLength(2));
    const cards = summaryCards(render());
    expect(new Set(cards.map((card) => card.key)).size).toBe(2);
    const card = EmergencyRequestSummaryCard(cards[0].props);
    expect(card.props.accessibilityLabel).toBe('Emergency Assistance. Submitted: Not available. Status: Status unavailable.');
    expect(card.props.accessible).toBe(true);
    expect(screenText(card)).not.toContain('UNKNOWN');
    expect(press(card, 'View Details')).toBe(false);
    expect(card.props.disabled).toBe(true);
    press(card, card.props.accessibilityLabel);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'])(
    'opens the selected card using only its identifier: %s', (id) => {
      const card = EmergencyRequestSummaryCard({ request: { ...request, id } });
      press(card, card.props.accessibilityLabel);
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith({
        pathname: '/resident/emergency-request/[requestId]', params: { requestId: id }
      });
    }
  );

  it.each(['', '../request', 'invalid-id'])('does not navigate for an invalid card identifier: %s', (id) => {
    const card = EmergencyRequestSummaryCard({ request: { ...request, id } });
    expect(card.props.disabled).toBe(true);
    press(card, card.props.accessibilityLabel);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each([null, request])('routes confirmation tracking without request parameters (submission: %j)', (submittedResponseRequest) => {
    vi.mocked(useEmergencyAssistanceDraft).mockReturnValue({
      ...useEmergencyAssistanceDraft(), submittedResponseRequest
    });
    expect(press(EmergencyRequestSubmittedScreen(), 'Track emergency request')).toBe(true);
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/resident/my-emergency-requests');
  });

  it('provides a tracking entry from Help without submitting another request', () => {
    expect(press(EmergencyAssistanceScreen(), 'My Emergency Requests')).toBe(true);
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/resident/my-emergency-requests');
    expect(residentPrimaryActions.find((action) => action.title === 'Help / Emergency Assistance')?.href).toBe('/resident/help');
  });

  it('preserves the existing hazard report navigation', () => {
    expect(residentBottomNavItems.find((item) => item.label === 'Reports')?.href).toBe('/resident/reports');
    expect(residentPrimaryActions.find((item) => item.title === 'Report Status & Reviews')?.href).toBe('/resident/reports');
  });

  it('returns to the previous screen when history exists', () => {
    expect(press(render(), 'Go back')).toBe(true);
    expect(navigation.back).toHaveBeenCalledOnce();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('returns direct entries without history to Help', () => {
    navigation.canGoBack.mockReturnValue(false);
    press(render(), 'Go back');
    expect(navigation.replace).toHaveBeenCalledWith('/resident/help');
    expect(navigation.back).not.toHaveBeenCalled();
  });

  it('inherits the existing Resident-only layout', () => {
    const guard = ResidentLayout().props.children.props.children;
    expect(guard.type).toBe(RoleRouteLayout);
    expect(guard.props.allowedRole).toBe('RESIDENT');
    expect(RoleRouteLayout(guard.props).type).toBe('stack');
    auth.status = 'unauthenticated';
    expect(RoleRouteLayout(guard.props).props.href).toBe('/auth/login');
    auth.status = 'authenticated';
    auth.user.role = 'EMERGENCY_RESPONDER';
    expect(RoleRouteLayout(guard.props).props.href).toBe('/responder');
  });

  it('does not fetch without authentication', () => {
    auth.accessToken = null;
    expect(screenText(render())).toContain('Please log in again.');
    lifecycle.effect();
    expect(listMyResponseRequests).not.toHaveBeenCalled();
  });

  it('shows a safe message instead of technical backend errors', async () => {
    vi.mocked(listMyResponseRequests).mockRejectedValue(new Error('Database connection details'));
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('Unable to load your emergency requests right now.'));
    expect(screenText(render())).not.toContain('Database');
  });

  it('ignores a response after cleanup and hides previous session data', async () => {
    let resolve!: (value: { responseRequests: SafeResponseRequest[] }) => void;
    vi.mocked(listMyResponseRequests).mockReturnValue(new Promise((done) => { resolve = done; }));
    render();
    const cleanup = lifecycle.effect();
    cleanup?.();
    resolve({ responseRequests: [] });
    await Promise.resolve();
    expect(screenText(render())).toContain('Loading your emergency requests');

    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [] });
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('You have no emergency assistance requests yet.'));
    auth.accessToken = 'another-session-token';
    expect(screenText(render())).toContain('Loading your emergency requests');
  });
});

function renderDetails() {
  lifecycle.cursor = 0;
  return ResidentEmergencyRequestDetailsScreen();
}

describe('Resident Emergency Request Details', () => {
  it('registers the screen in the resident route and retrieves the selected ID with the session token', async () => {
    expect(ResidentEmergencyRequestDetailsRoute().type).toBe(ResidentEmergencyRequestDetailsScreen);
    expect(screenText(renderDetails())).toContain('Loading your emergency request details');
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Water has entered the house.'));
    expect(getMyResponseRequestById).toHaveBeenCalledExactlyOnceWith(request.id, 'resident-token');
    expect(listMyResponseRequests).not.toHaveBeenCalled();

    const text = screenText(renderDetails());
    for (const expected of [
      'Emergency Request Details', 'Status:  In Progress', request.id, 'Medical Assistance',
      formatResidentReportDateTime(request.createdAt), 'People needing assistance 7', 'Injured people 2',
      'Children 3', 'Elderly people 1', 'Persons with disabilities 2', 'Pregnant persons 0',
      'Medical assistance Required', 'Road access Limited', 'Wheelchair-accessible transport required.',
      'Latitude 6.927100', 'Longitude 79.861200', 'Name Resident Contact',
      'Phone +94-77-555-1234', 'Email resident@example.test'
    ]) expect(text).toContain(expected);
    expect(text).not.toContain('IN_PROGRESS');
    expect(text).not.toContain(request.createdAt);
  });

  it('renders missing optional and null presentation fields safely', async () => {
    const incomplete = {
      ...detailedRequest, specialRequirements: undefined, vulnerablePeople: null, medicalNeeds: null,
      roadAccessibility: null, location: null, contact: null, createdAt: 'invalid-date'
    } as unknown as SafeResponseRequest;
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: incomplete });
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Special requirements Not provided'));
    const text = screenText(renderDetails());
    for (const expected of ['Submitted Not available', 'Children Not provided', 'Medical assistance Not provided',
      'Road access Not provided', 'Latitude Not provided', 'Name Not provided', 'Email Not provided']) {
      expect(text).toContain(expected);
    }
  });

  it.each([
    ['DISPATCHED', 'Dispatched Current stage', 'In Progress Not yet reached'],
    ['IN_PROGRESS', 'In Progress Current stage', 'Dispatched Reached']
  ] as const)('renders progress from the authenticated details response status: %s', async (status, current, other) => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...detailedRequest, status } });
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Emergency Response Progress'));
    const text = screenText(renderDetails());
    expect(text).toContain(current);
    expect(text).toContain(other);
    expect(text).not.toContain('IN_PROGRESS');
    expect(getMyResponseRequestById).toHaveBeenCalledExactlyOnceWith(request.id, 'resident-token');
  });

  it.each([undefined, '', 'bad-id', '../requests', [request.id], [request.id, request.id]])(
    'does not fetch for a missing or ambiguous route ID: %j', (requestId) => {
      lifecycle.params = { requestId };
      expect(screenText(renderDetails())).toContain('Select a valid request from My Emergency Requests.');
      lifecycle.effect();
      expect(getMyResponseRequestById).not.toHaveBeenCalled();
    }
  );

  it('does not fetch without authentication', () => {
    auth.accessToken = null;
    expect(screenText(renderDetails())).toContain('Please log in again.');
    lifecycle.effect();
    expect(getMyResponseRequestById).not.toHaveBeenCalled();
  });

  it.each([403, 404])('does not expose private details when the secure endpoint denies access (%s)', async (status) => {
    vi.mocked(getMyResponseRequestById).mockRejectedValue(new ApiClientError(status, 'REQUEST_NOT_FOUND', 'Private server message'));
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('This emergency request is unavailable.'));
    expect(screenText(renderDetails())).not.toContain(detailedRequest.description);
    expect(screenText(renderDetails())).not.toContain('Private server message');
  });

  it.each([
    [401, 'Your session has expired. Please log in again.'],
    [500, 'Unable to load your emergency request details right now.'],
    [0, 'Unable to load your emergency request details right now.']
  ] as const)('shows safe feedback for API failures (%s)', async (status, message) => {
    vi.mocked(getMyResponseRequestById).mockRejectedValue(new ApiClientError(status, 'ERROR', 'Internal database information'));
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain(message));
    expect(screenText(renderDetails())).not.toContain('Internal');
  });

  it('preserves back navigation and uses the request list for a direct link without history', () => {
    press(renderDetails(), 'Go back');
    expect(navigation.back).toHaveBeenCalledOnce();
    navigation.canGoBack.mockReturnValue(false);
    press(renderDetails(), 'Go back');
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith('/resident/my-emergency-requests');
  });

  it('hides old details immediately when the selected request or session changes', async () => {
    renderDetails();
    const cleanup = lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain(detailedRequest.description));
    lifecycle.params = { requestId: '507f1f77bcf86cd799439012' };
    expect(screenText(renderDetails())).not.toContain(detailedRequest.description);
    lifecycle.params = { requestId: request.id };
    auth.accessToken = 'another-resident-token';
    expect(screenText(renderDetails())).not.toContain(detailedRequest.description);
    cleanup?.();
  });

  it('ignores a late response after leaving the details screen', async () => {
    let resolve: ((value: { responseRequest: SafeResponseRequest }) => void) | undefined;
    vi.mocked(getMyResponseRequestById).mockReturnValue(new Promise((done) => { resolve = done; }));
    renderDetails();
    const cleanup = lifecycle.effect();
    cleanup?.();
    resolve?.({ responseRequest: detailedRequest });
    await Promise.resolve();
    expect(screenText(renderDetails())).not.toContain(detailedRequest.description);
  });
});

describe('Resident details Cancel Request action (LDFEW-321)', () => {
  it('offers NEW requests a non-mutating action prepared for confirmation', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: request });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));

    expect(press(renderDetails(), 'Cancel Request')).toBe(true);
    expect(press(renderDetails(), 'Cancel Request')).toBe(true);
    const text = screenText(renderDetails());
    expect(text).toContain('Cancellation is not available yet. Your request is still active.');
    expect(text.match(/Cancel Request/g)).toHaveLength(1);
    expect(text.match(/Your request is still active/g)).toHaveLength(1);
    expect(text).toContain('Status:  Submitted');
    expect(text).toContain('Submitted Current stage');
    expect(text).toContain(request.description);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getMyResponseRequestById).toHaveBeenCalledExactlyOnceWith(request.id, 'resident-token');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it.each(['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'UNKNOWN', undefined, null, ''])(
    'hides the action safely for a non-cancellable or missing status: %j', async (status) => {
      // Model malformed runtime data as well as valid lifecycle stages.
      vi.mocked(getMyResponseRequestById).mockResolvedValue({
        responseRequest: { ...request, status } as SafeResponseRequest
      });
      renderDetails();
      lifecycle.effect();
      await vi.waitFor(() => expect(screenText(renderDetails())).toContain(request.description));
      expect(screenText(renderDetails())).not.toContain('Cancel Request');
      expect(press(renderDetails(), 'Cancel Request')).toBe(false);
      if (!status || status === 'UNKNOWN') expect(screenText(renderDetails())).toContain('Status unavailable');
    }
  );

  it('does not offer cancellation before the request has loaded or when request data is missing', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: null as unknown as SafeResponseRequest });
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
    lifecycle.effect();
    expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    await Promise.resolve();
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
  });

  it('hides stale NEW data during refresh and keeps the action hidden after responder assignment', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: request });
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));

    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...request, status: 'ASSIGNED' } });
    expect(press(renderDetails(), 'Refresh emergency request details')).toBe(true);
    expect(screenText(renderDetails())).toContain('Loading your emergency request details');
    expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Assigned Current stage'));
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
    expect(getMyResponseRequestById).toHaveBeenCalledTimes(2);
  });

  it('keeps cancellation hidden after a failed refresh and preserves Retry recovery', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: request });
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));
    vi.mocked(getMyResponseRequestById).mockRejectedValueOnce(new Error('Private database details'));
    press(renderDetails(), 'Refresh emergency request details');
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Unable to load request details'));
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
    expect(screenText(renderDetails())).not.toContain('Private');
    expect(press(renderDetails(), 'Retry')).toBe(true);
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));
  });

  it('hides the action and notice when the selected request or authenticated session changes', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: request });
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));
    press(renderDetails(), 'Cancel Request');
    lifecycle.params = { requestId: '507f1f77bcf86cd799439012' };
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
    expect(screenText(renderDetails())).not.toContain('Your request is still active');
    lifecycle.params = { requestId: request.id };
    auth.accessToken = null;
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
    expect(screenText(renderDetails())).toContain('Please log in again.');
  });
});
