import * as React from 'react';
import type {} from '../../../../../../api/src/types/express';
import type { SafeResponseRequest, UserRole } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MyEmergencyRequestsRoute from '../../../../../app/resident/my-emergency-requests';
import ResidentEmergencyRequestDetailsRoute from '../../../../../app/resident/emergency-request/[requestId]';
import ResidentLayout from '../../../../../app/resident/_layout';
import { RoleRouteLayout } from '../../../auth/screens/RoleRouteLayout';
import { cancelResidentResponseRequest, getMyResponseRequestById, listMyResponseRequests } from '../api/responseRequestApi';
import { EmergencyRequestCancellationDialog } from '../components/EmergencyRequestCancellationDialog';
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
  Modal: 'dialog', ScrollView: 'section',
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../../auth/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('../../shared/currentLocation', () => ({ captureCurrentLocation: vi.fn(), formatCoordinate: vi.fn() }));
vi.mock('../api/responseRequestApi', () => ({ listMyResponseRequests: vi.fn(), getMyResponseRequestById: vi.fn(), cancelResidentResponseRequest: vi.fn() }));
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
  vi.mocked(cancelResidentResponseRequest).mockResolvedValue({ responseRequest: { ...request, status: 'CANCELLED' } });
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

function cancellationDialog(node: React.ReactNode): React.ComponentProps<typeof EmergencyRequestCancellationDialog> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const dialog = cancellationDialog(child);
      if (dialog) return dialog;
    }
    return null;
  }
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return null;
  if (node.type === EmergencyRequestCancellationDialog) return node.props as React.ComponentProps<typeof EmergencyRequestCancellationDialog>;
  return cancellationDialog(node.props.children);
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
  it('opens one confirmation without mutation and Keep Request safely dismisses it', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: request });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));

    expect(press(renderDetails(), 'Cancel Request')).toBe(true);
    expect(press(renderDetails(), 'Cancel Request')).toBe(true);
    const text = screenText(renderDetails());
    expect(text.match(/Cancel emergency request\?/g)).toHaveLength(1);
    expect(text).toContain('Are you sure you want to cancel this emergency assistance request? This action cannot be undone.');
    expect(text).toContain('Keep Request');
    expect(text).toContain('Cancel Request');
    expect(text).toContain('Status:  Submitted');
    expect(text).toContain('Submitted Current stage');
    expect(text).toContain(request.description);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getMyResponseRequestById).toHaveBeenCalledExactlyOnceWith(request.id, 'resident-token');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    const confirm = cancellationDialog(renderDetails())!.onConfirm;
    expect(press(renderDetails(), 'Keep Request')).toBe(true);
    expect(cancellationDialog(renderDetails())).toBeNull();
    confirm();
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
    expect(screenText(renderDetails())).toContain('Status:  Submitted');
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

  it('hides the action and confirmation when the selected request or authenticated session changes', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: request });
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));
    press(renderDetails(), 'Cancel Request');
    lifecycle.params = { requestId: '507f1f77bcf86cd799439012' };
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
    expect(cancellationDialog(renderDetails())).toBeNull();
    lifecycle.params = { requestId: request.id };
    auth.accessToken = null;
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
    expect(screenText(renderDetails())).toContain('Please log in again.');
  });
});

describe('Resident emergency request history (LDFEW-325)', () => {
  it('keeps every lifecycle status in the owner-scoped list and preserves API order', async () => {
    const statuses = ['NEW', 'ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
    const requests = statuses.map((status, index) => ({ ...request, id: `${request.id.slice(0, -1)}${index}`, status }));
    const api = await vi.importActual<typeof import('../api/responseRequestApi')>('../api/responseRequestApi');
    vi.mocked(listMyResponseRequests).mockImplementationOnce(api.listMyResponseRequests);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ responseRequests: requests }));
    vi.stubGlobal('fetch', fetchMock);
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(summaryCards(render())).toHaveLength(7));
    expect(summaryCards(render()).map((card) => card.props.request.id)).toEqual(requests.map(({ id }) => id));
    for (const label of ['Submitted', 'Assigned', 'Dispatched', 'Arrived', 'In Progress', 'Completed', 'Cancelled']) {
      expect(screenText(render())).toContain(`Status:  ${label}`);
    }
    expect(screenText(render())).toContain('7 emergency assistance requests submitted.');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${apiBaseUrl}/response-requests/mine`,
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer resident-token' }) }));
  });

  it.each([['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled']] as const)(
    'opens a %s record from My Emergency Requests with all stored details and no cancellation action', async (status, label) => {
      const historical = { ...detailedRequest, status };
      vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [historical] });
      vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: historical });
      render();
      const blur = lifecycle.effect();
      await vi.waitFor(() => expect(summaryCards(render())).toHaveLength(1));
      const card = EmergencyRequestSummaryCard(summaryCards(render())[0].props);
      expect(card.props.disabled).toBe(false);
      expect(card.props.accessibilityLabel).toContain(`Status: ${label}.`);
      expect(press(card, card.props.accessibilityLabel)).toBe(true);
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith({
        pathname: '/resident/emergency-request/[requestId]', params: { requestId: historical.id }
      });
      blur?.();
      lifecycle.slots = [];
      lifecycle.params = { requestId: historical.id };
      expect(screenText(renderDetails())).toContain('Loading your emergency request details');
      lifecycle.effect();
      await vi.waitFor(() => expect(screenText(renderDetails())).toContain(`Status:  ${label}`));
      const text = screenText(renderDetails());
      for (const value of [historical.id, 'Medical Assistance', formatResidentReportDateTime(historical.createdAt),
        'People needing assistance 7', 'Injured people 2', 'Children 3', 'Elderly people 1',
        'Persons with disabilities 2', 'Pregnant persons 0', 'Medical assistance Required', 'Road access Limited',
        'Latitude 6.927100', 'Longitude 79.861200', historical.description, historical.specialRequirements!,
        historical.contact.name, historical.contact.phoneNumber, historical.contact.email!]) {
        expect(text).toContain(value);
      }
      expect(press(renderDetails(), 'Cancel Request')).toBe(false);
      expect(cancellationDialog(renderDetails())).toBeNull();
      expect(getMyResponseRequestById).toHaveBeenCalledExactlyOnceWith(historical.id, 'resident-token');
      if (status === 'CANCELLED') {
        expect(text).toContain('This request is no longer active.');
        expect(text).not.toMatch(/Current stage|Not yet reached|Progress unavailable/);
      } else {
        expect(text).toContain('Completed Current stage');
        expect(text).not.toContain('Not yet reached');
      }
    }
  );

  it('keeps a terminal-only list nonempty and retains a newly cancelled record across refreshes', async () => {
    const completed = { ...request, id: '507f1f77bcf86cd799439012', status: 'COMPLETED' as const };
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [request, completed] });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('Status:  Submitted'));
    const cancelled = { ...request, status: 'CANCELLED' as const };
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [cancelled, completed] });
    for (let refresh = 0; refresh < 2; refresh += 1) {
      expect(press(render(), 'Refresh emergency requests')).toBe(true);
      await vi.waitFor(() => expect(screenText(render())).toContain('Status:  Cancelled'));
      expect(screenText(render())).toContain('Status:  Completed');
      expect(screenText(render())).toContain('2 emergency assistance requests submitted.');
      expect(screenText(render())).not.toContain('You have no emergency assistance requests yet.');
      expect(summaryCards(render()).map((card) => card.props.request.id)).toEqual([request.id, completed.id]);
    }
    expect(listMyResponseRequests).toHaveBeenCalledTimes(3);
  });

  it.each([undefined, 'UNKNOWN'] as const)('keeps history readable alongside a missing/unknown status: %j', async (status) => {
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [
      { ...request, status } as unknown as SafeResponseRequest,
      { ...request, id: '507f1f77bcf86cd799439012', status: 'CANCELLED' },
      { ...request, id: '507f1f77bcf86cd799439013', status: 'COMPLETED' }
    ] });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(summaryCards(render())).toHaveLength(3));
    expect(screenText(render())).toContain('Status unavailable');
    expect(screenText(render())).toContain('Status:  Cancelled');
    expect(screenText(render())).toContain('Status:  Completed');
    expect(screenText(render())).not.toContain('UNKNOWN');
  });

  it('recovers terminal records after a failed refresh without duplicating or hiding history', async () => {
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [{ ...request, status: 'CANCELLED' }] });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('Status:  Cancelled'));
    vi.mocked(listMyResponseRequests).mockRejectedValueOnce(new Error('Private database error'));
    press(render(), 'Refresh emergency requests');
    await vi.waitFor(() => expect(screenText(render())).toContain('Unable to load requests'));
    expect(screenText(render())).not.toContain('Private');
    expect(screenText(render())).not.toContain('You have no emergency assistance requests yet.');
    expect(press(render(), 'Retry')).toBe(true);
    await vi.waitFor(() => expect(screenText(render())).toContain('Status:  Cancelled'));
    expect(summaryCards(render())).toHaveLength(1);
  });
});

describe('cancellation across mobile and authenticated backend (LDFEW-327)', () => {
  async function connectWorkflow(loseCancellationResponse = false) {
    const { createApp } = await import('../../../../../../api/src/app');
    const { loadConfig } = await import('../../../../../../api/src/config/env');
    const { InMemoryAuthRepository } = await import('../../../../../../api/src/modules/auth/repositories/inMemoryAuth.repository');
    const { InMemoryResponseRequestRepository } = await import('../../../../../../api/src/modules/response-requests/repositories/inMemoryResponseRequest.repository');
    const { signAccessToken } = await import('../../../../../../api/src/modules/auth/services/token.service');
    const { default: http } = await import('supertest');
    const api = await vi.importActual<typeof import('../api/responseRequestApi')>('../api/responseRequestApi');
    const queues = await import('../../responder/api/responderRequestsApi');
    const { getResponderQueueCounts } = await import('../../responder/queueState');
    const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'workflow-test-secret' };
    const repository = new InMemoryResponseRequestRepository();
    repository.seedResponseRequest(structuredClone(request));
    const otherRequest = { ...request, id: '507f1f77bcf86cd799439012' };
    repository.seedResponseRequest(otherRequest);
    const responderId = 'responder-workflow';
    repository.seedResponseRequest({ ...request, id: '507f1f77bcf86cd799439013', declinedByResponderIds: [responderId] });
    const app = createApp({ config, authRepository: new InMemoryAuthRepository(), responseRequestRepository: repository });
    auth.accessToken = signAccessToken(config, { id: request.residentId, role: 'RESIDENT' });
    const responderToken = signAccessToken(config, { id: responderId, role: 'EMERGENCY_RESPONDER' });
    const write = vi.spyOn(repository, 'cancelResponseRequest');
    // Only bridge the transport: actual mobile adapters, JWT middleware, controllers,
    // services and repository run together. Native rendering remains mocked.
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      const path = new URL(String(url)).pathname;
      const method = options?.method ?? 'GET';
      if (method !== 'GET' && method !== 'PATCH') throw new Error('Unexpected workflow test method');
      const call = method === 'PATCH' ? http(app).patch(path) : http(app).get(path);
      const authorization = new Headers(options?.headers).get('Authorization');
      if (authorization) call.set('Authorization', authorization);
      if (options?.body) call.send(JSON.parse(String(options.body)));
      const result = await call;
      if (loseCancellationResponse && method === 'PATCH' && path.endsWith('/cancel')) {
        throw new Error('Simulated lost response after backend completion');
      }
      return Response.json(result.body, { status: result.status });
    });
    vi.stubGlobal('fetch', transport);
    vi.mocked(getMyResponseRequestById).mockImplementation(api.getMyResponseRequestById);
    vi.mocked(listMyResponseRequests).mockImplementation(api.listMyResponseRequests);
    vi.mocked(cancelResidentResponseRequest).mockImplementation(api.cancelResidentResponseRequest);
    const loadQueues = async () => {
      const pending = await queues.listPendingResponderRequests(responderToken);
      const assigned = await queues.listAssignedResponderRequests(responderToken);
      return { pending, assigned, counts: getResponderQueueCounts({ pending, assigned }) };
    };
    return { repository, write, transport, loadQueues, otherRequest, accept: () => http(app)
      .patch(`/api/v1/response-requests/responder/requests/${request.id}/accept`).auth(responderToken, { type: 'bearer' }) };
  }

  it('confirms once, retains the record through fresh history reads and removes only cancelled work from responder queues', async () => {
    const { repository, write, transport, loadQueues, otherRequest } = await connectWorkflow();
    expect((await loadQueues()).counts).toEqual({ PENDING: 2, ASSIGNED: 0 });
    render();
    const leaveList = lifecycle.effect();
    await vi.waitFor(() => expect(summaryCards(render())).toHaveLength(3));
    const card = EmergencyRequestSummaryCard(summaryCards(render()).find((item) => item.props.request.id === request.id)!.props);
    press(card, card.props.accessibilityLabel);
    expect(navigation.push).toHaveBeenCalledWith({ pathname: '/resident/emergency-request/[requestId]', params: { requestId: request.id } });
    leaveList?.();
    lifecycle.slots = [];
    renderDetails();
    const leaveDetails = lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));
    press(renderDetails(), 'Cancel Request');
    cancellationDialog(renderDetails())!.onKeepRequest();
    expect(write).not.toHaveBeenCalled();
    expect(screenText(renderDetails())).not.toContain('cancelled successfully');
    expect(await repository.findResponseRequestById(request.id, request.residentId)).toEqual(request);
    press(renderDetails(), 'Cancel Request');
    const dialog = cancellationDialog(renderDetails())!;
    dialog.onConfirm();
    dialog.onConfirm();
    expect(screenText(renderDetails())).toContain('Cancelling...');
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Emergency request cancelled successfully.'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
    const saved = await repository.findResponseRequestById(request.id, request.residentId);
    expect(saved).toEqual({ ...request, status: 'CANCELLED', cancelledAt: expect.any(String), updatedAt: expect.any(String) });
    expect(cancellationDialog(renderDetails())).toBeNull();
    expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    press(renderDetails(), 'Refresh emergency request details');
    await vi.waitFor(() => {
      expect(screenText(renderDetails())).not.toContain('Loading');
      expect(screenText(renderDetails())).toContain('Status:  Cancelled');
    });
    leaveDetails?.();
    lifecycle.slots = [];
    render();
    const leaveHistory = lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('Status:  Cancelled'));
    press(render(), 'Refresh emergency requests');
    await vi.waitFor(() => {
      expect(screenText(render())).not.toContain('Loading');
      expect(summaryCards(render())).toHaveLength(3);
      expect(screenText(render())).toContain('Status:  Cancelled');
    });
    expect(summaryCards(render()).filter((item) => item.props.request.id === request.id)).toHaveLength(1);
    leaveHistory?.();
    lifecycle.slots = [];
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('This request is no longer active.'));
    expect(screenText(renderDetails())).toContain(request.description);
    expect(screenText(renderDetails())).toContain(request.contact.phoneNumber);
    const queues = await loadQueues();
    expect(queues.pending.map(({ id }) => id)).toEqual([otherRequest.id]);
    expect(queues.counts).toEqual({ PENDING: 1, ASSIGNED: 0 });
    expect(await repository.findResponseRequestById(request.id, request.residentId)).toEqual(saved);
  });

  it('reconciles a real backend rejection after responder acceptance while the confirmation is open', async () => {
    const { repository, write, accept, loadQueues } = await connectWorkflow();
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));
    press(renderDetails(), 'Cancel Request');
    const dialog = cancellationDialog(renderDetails())!;
    const accepted = await accept();
    expect(accepted.status).toBe(200);
    dialog.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Assigned Current stage'));
    expect(screenText(renderDetails())).toContain('response status has changed');
    expect(screenText(renderDetails())).not.toMatch(/cancelled successfully|Cancelling\.\.\./);
    expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(await repository.findResponseRequestById(request.id, request.residentId)).toEqual(accepted.body);
    const queues = await loadQueues();
    expect(queues.assigned.map(({ id }) => id)).toEqual([request.id]);
    expect(queues.counts).toEqual({ PENDING: 1, ASSIGNED: 1 });
  });

  it('recovers a committed cancellation after a lost response by reading history, never resubmitting', async () => {
    const { write, repository } = await connectWorkflow(true);
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));
    press(renderDetails(), 'Cancel Request');
    cancellationDialog(renderDetails())!.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('check your connection'));
    expect(screenText(renderDetails())).not.toContain('cancelled successfully');
    expect(cancellationDialog(renderDetails())).toBeNull();
    expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    expect(press(renderDetails(), 'Retry')).toBe(true);
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Status:  Cancelled'));
    expect(write).toHaveBeenCalledTimes(1);
    expect((await repository.findResponseRequestById(request.id, request.residentId))?.status).toBe('CANCELLED');
  });
});

describe('Resident emergency cancellation confirmation (LDFEW-322)', () => {
  async function openConfirmation() {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: request });
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));
    press(renderDetails(), 'Cancel Request');
    return cancellationDialog(renderDetails())!;
  }

  it('submits once only after confirmation and displays the server-confirmed cancelled request', async () => {
    const dialog = await openConfirmation();
    let resolve!: (response: { responseRequest: SafeResponseRequest }) => void;
    vi.mocked(cancelResidentResponseRequest).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
    dialog.onConfirm();
    dialog.onConfirm();
    dialog.onKeepRequest();
    expect(cancelResidentResponseRequest).toHaveBeenCalledExactlyOnceWith(request.id, 'resident-token');
    expect(cancellationDialog(renderDetails())?.isSubmitting).toBe(true);
    expect(screenText(renderDetails())).toContain('Cancelling...');
    expect(press(renderDetails(), 'Refresh emergency request details')).toBe(true);
    expect(getMyResponseRequestById).toHaveBeenCalledTimes(1);
    resolve({ responseRequest: { ...request, status: 'CANCELLED', cancelledAt: '2026-09-28T10:00:00.000Z' } });
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Status:  Cancelled'));
    expect(screenText(renderDetails())).toContain('Emergency request cancelled successfully.');
    expect(screenText(renderDetails())).not.toContain('Cancelling...');
    expect(cancellationDialog(renderDetails())).toBeNull();
    expect(screenText(renderDetails())).toContain(request.description);
    expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    dialog.onConfirm();
    expect(cancelResidentResponseRequest).toHaveBeenCalledTimes(1);
  });

  it('supports system dismissal as a safe Keep Request operation', async () => {
    const dialog = await openConfirmation();
    EmergencyRequestCancellationDialog(dialog).props.onRequestClose();
    expect(cancellationDialog(renderDetails())).toBeNull();
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
    expect(screenText(renderDetails())).toContain('Submitted Current stage');
  });

  it('does not reuse a dismissed dialog callback to approve a newly opened confirmation', async () => {
    const oldDialog = await openConfirmation();
    oldDialog.onKeepRequest();
    press(renderDetails(), 'Cancel Request');
    expect(cancellationDialog(renderDetails())).not.toBeNull();
    oldDialog.onConfirm();
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
  });

  it('uses the authenticated API adapter only after confirming', async () => {
    const api = await vi.importActual<typeof import('../api/responseRequestApi')>('../api/responseRequestApi');
    vi.mocked(cancelResidentResponseRequest).mockImplementationOnce(api.cancelResidentResponseRequest);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ responseRequest: { ...request, status: 'CANCELLED' } }));
    vi.stubGlobal('fetch', fetchMock);
    const dialog = await openConfirmation();
    expect(fetchMock).not.toHaveBeenCalled();
    dialog.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Status:  Cancelled'));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${apiBaseUrl}/response-requests/${request.id}/cancel`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer resident-token' }, body: undefined
    });
  });

  it('allows a new session to load details without accepting the old cancellation result', async () => {
    const dialog = await openConfirmation();
    let resolve!: (response: { responseRequest: SafeResponseRequest }) => void;
    vi.mocked(cancelResidentResponseRequest).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    dialog.onConfirm();
    auth.accessToken = 'renewed-token';
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...request, status: 'ASSIGNED' } });
    renderDetails();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Assigned Current stage'));
    resolve({ responseRequest: { ...request, status: 'CANCELLED' } });
    await Promise.resolve();
    expect(screenText(renderDetails())).toContain('Assigned Current stage');
    expect(cancellationDialog(renderDetails())).toBeNull();
  });

  it.each(['refresh', 'request', 'session', 'blur'] as const)('rejects obsolete confirmation after %s', async (change) => {
    const dialog = await openConfirmation();
    if (change === 'refresh') {
      vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...request, status: 'ASSIGNED' } });
      press(renderDetails(), 'Refresh emergency request details');
      await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Assigned Current stage'));
    } else if (change === 'request') {
      lifecycle.params = { requestId: '507f1f77bcf86cd799439012' };
    } else if (change === 'session') {
      auth.accessToken = 'other-session';
    } else {
      lifecycle.effect()?.();
    }
    expect(cancellationDialog(renderDetails())).toBeNull();
    dialog.onConfirm();
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
  });

  it.each([409, 403, 404, 401, 500, 0])('handles backend rejection/failure (%s) without exposing internals or automatically retrying', async (status) => {
    const dialog = await openConfirmation();
    if (status === 409) {
      // LDFEW-326 reconciles conflicts automatically; the mutation must still run only once.
      vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...request, status: 'ASSIGNED' } });
    }
    vi.mocked(cancelResidentResponseRequest).mockRejectedValueOnce(new ApiClientError(status, 'ERROR', 'Private database details'));
    dialog.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain(status === 409 ? 'Assigned Current stage' : 'Unable to load request details'));
    expect(screenText(renderDetails())).not.toContain('Private');
    expect(screenText(renderDetails())).not.toContain('Cancel Request');
    expect(cancellationDialog(renderDetails())).toBeNull();
    if (status === 409) expect(screenText(renderDetails())).toContain('response status has changed');
    expect(cancelResidentResponseRequest).toHaveBeenCalledTimes(1);
    // Reload current backend state before making any new cancellation decision.
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: { ...request, status: 'ASSIGNED' } });
    if (status !== 409) expect(press(renderDetails(), 'Retry')).toBe(true);
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Assigned Current stage'));
    expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    expect(cancelResidentResponseRequest).toHaveBeenCalledTimes(1);
  });

  it('recovers safely if the cancellation action throws unexpectedly', async () => {
    const dialog = await openConfirmation();
    vi.mocked(cancelResidentResponseRequest).mockImplementationOnce(() => { throw new TypeError('Internal action unavailable'); });
    dialog.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Unable to confirm cancellation.'));
    expect(screenText(renderDetails())).not.toContain('Internal');
    expect(cancellationDialog(renderDetails())).toBeNull();
  });

  it('ignores a late cancellation result after the authenticated session changes', async () => {
    const dialog = await openConfirmation();
    let resolve!: (response: { responseRequest: SafeResponseRequest }) => void;
    vi.mocked(cancelResidentResponseRequest).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    dialog.onConfirm();
    auth.accessToken = null;
    renderDetails();
    resolve({ responseRequest: { ...request, status: 'CANCELLED' } });
    await Promise.resolve();
    expect(screenText(renderDetails())).toContain('Please log in again.');
    expect(screenText(renderDetails())).not.toContain('Status:  Cancelled');
  });

  it.each(['INVALID_CANCELLATION_STATUS', 'REQUEST_CANCELLATION_CONFLICT'])(
    'refreshes stale status after %s while ending cancellation loading immediately', async (code) => {
      const dialog = await openConfirmation();
      let resolve!: (response: { responseRequest: SafeResponseRequest }) => void;
      vi.mocked(getMyResponseRequestById).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
      vi.mocked(cancelResidentResponseRequest).mockRejectedValueOnce(new ApiClientError(409, code, 'Mongoose private details'));
      dialog.onConfirm();
      await vi.waitFor(() => expect(getMyResponseRequestById).toHaveBeenCalledTimes(2));
      expect(screenText(renderDetails())).toContain('This request can no longer be cancelled because its response status has changed.');
      expect(screenText(renderDetails())).not.toContain('Cancelling...');
      expect(cancellationDialog(renderDetails())).toBeNull();
      dialog.onConfirm();
      expect(cancelResidentResponseRequest).toHaveBeenCalledTimes(1);
      resolve({ responseRequest: { ...request, status: 'IN_PROGRESS' } });
      await vi.waitFor(() => expect(screenText(renderDetails())).toContain('In Progress Current stage'));
      expect(screenText(renderDetails())).toContain('response status has changed');
      expect(screenText(renderDetails())).not.toContain('Mongoose');
      expect(screenText(renderDetails())).not.toContain('cancelled successfully');
      expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    }
  );

  it('offers safe read-only recovery when the conflict refresh also fails', async () => {
    const dialog = await openConfirmation();
    vi.mocked(cancelResidentResponseRequest).mockRejectedValueOnce(new ApiClientError(409, 'INVALID_CANCELLATION_STATUS', 'Internal conflict'));
    vi.mocked(getMyResponseRequestById).mockRejectedValueOnce(new Error('Private network details'));
    dialog.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Unable to load request details'));
    expect(screenText(renderDetails())).toContain('response status has changed');
    expect(screenText(renderDetails())).not.toMatch(/Cancelling\.\.\.|Private|Internal/);
    expect(cancellationDialog(renderDetails())).toBeNull();
    expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: { ...request, status: 'ASSIGNED' } });
    expect(press(renderDetails(), 'Retry')).toBe(true);
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Assigned Current stage'));
    expect(cancelResidentResponseRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['UNAUTHORIZED', 401, 'Your session is no longer valid. Please sign in again.'],
    ['REQUEST_NOT_OWNED', 403, 'You are not allowed to cancel this emergency request.'],
    ['REQUEST_NOT_FOUND', 404, 'This emergency request could not be found. Please refresh your requests.'],
    ['INVALID_REQUEST_ID', 400, 'This emergency request is unavailable. Please refresh your requests.'],
    ['NETWORK_ERROR', 0, 'Please check your connection'],
    ['INTERNAL_SERVER_ERROR', 500, 'Unable to cancel this request right now. Please refresh and try again.'],
    ['UNKNOWN', 400, 'Unable to confirm cancellation. Please refresh the request before trying again.']
  ] as const)('shows friendly %s feedback and releases submission controls', async (code, status, message) => {
    const dialog = await openConfirmation();
    vi.mocked(cancelResidentResponseRequest).mockRejectedValueOnce(new ApiClientError(status, code, 'Raw database stack trace'));
    dialog.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain(message));
    expect(cancellationDialog(renderDetails())).toBeNull();
    expect(screenText(renderDetails())).not.toMatch(/Cancelling\.\.\.|Raw|stack trace|cancelled successfully/);
    expect(press(renderDetails(), 'Retry')).toBe(true);
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Cancel Request'));
    expect(cancelResidentResponseRequest).toHaveBeenCalledTimes(1);
  });

  it('permits a new confirmed attempt after a network failure only after reloading eligible server state', async () => {
    const dialog = await openConfirmation();
    vi.mocked(cancelResidentResponseRequest).mockRejectedValueOnce(new ApiClientError(0, 'NETWORK_ERROR', 'Internal address'));
    dialog.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('check your connection'));
    expect(press(renderDetails(), 'Cancel Request')).toBe(false);
    expect(press(renderDetails(), 'Retry')).toBe(true);
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Submitted Current stage'));
    expect(press(renderDetails(), 'Cancel Request')).toBe(true);
    expect(cancelResidentResponseRequest).toHaveBeenCalledTimes(1);
    const retryDialog = cancellationDialog(renderDetails())!;
    retryDialog.onConfirm();
    retryDialog.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Emergency request cancelled successfully.'));
    expect(cancelResidentResponseRequest).toHaveBeenCalledTimes(2);
    expect(screenText(renderDetails())).toContain('Status:  Cancelled');
    expect(screenText(renderDetails())).toContain(request.contact.phoneNumber);
    expect(screenText(renderDetails())).toContain(request.description);
    expect(screenText(renderDetails())).not.toContain('check your connection');
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it.each([null, { responseRequest: { id: request.id, status: 'CANCELLED' } }])(
    'does not show success for an invalid or incomplete API response: %j', async (response) => {
      const api = await vi.importActual<typeof import('../api/responseRequestApi')>('../api/responseRequestApi');
      const dialog = await openConfirmation();
      vi.mocked(cancelResidentResponseRequest).mockImplementationOnce(api.cancelResidentResponseRequest);
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
      vi.stubGlobal('fetch', fetchMock);
      dialog.onConfirm();
      await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Unable to confirm cancellation.'));
      expect(screenText(renderDetails())).not.toContain('cancelled successfully');
      expect(screenText(renderDetails())).not.toContain('Status:  Cancelled');
      expect(cancellationDialog(renderDetails())).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('does not leak success feedback into another request or session', async () => {
    const dialog = await openConfirmation();
    dialog.onConfirm();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Emergency request cancelled successfully.'));
    lifecycle.params = { requestId: '507f1f77bcf86cd799439012' };
    expect(screenText(renderDetails())).not.toContain('cancelled successfully');
    lifecycle.params = { requestId: request.id };
    auth.accessToken = 'different-session';
    expect(screenText(renderDetails())).not.toContain('cancelled successfully');
  });
});
