import * as React from 'react';
import { Alert } from 'react-native';
import type { SafeResponseRequest } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponderDashboardScreen } from './ResponderDashboardScreen';
import { ResponderRequestDetailsScreen } from './ResponderRequestDetailsScreen';
import { ReportListItem } from '../../shared/components/ReportListItem';
import { updateResponderRequestProgress } from '../api/responderProgressApi';
import { listAssignedResponderRequests, listPendingResponderRequests } from '../api/responderRequestsApi';
import { clearResponderRequestCache, getCachedResponderRequest, updateCachedResponderRequest } from '../requestDetailsCache';
import { getResponderProgressAction } from '../progressUi';

// Exercise the screen's focus/blur callbacks and async loads without a native runtime.
const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  params: {} as Record<string, string | string[] | undefined>,
  focus: (() => undefined) as () => (() => void) | undefined
}));
const navigation = vi.hoisted(() => ({ setParams: vi.fn(), replace: vi.fn(), dismissTo: vi.fn() }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useRef: (initial: unknown) => {
    const index = lifecycle.cursor++;
    lifecycle.slots[index] ??= { current: initial };
    return lifecycle.slots[index];
  },
  useState: (initial: unknown) => {
    const index = lifecycle.cursor++;
    if (!(index in lifecycle.slots)) lifecycle.slots[index] = initial;
    return [lifecycle.slots[index], (value: unknown) => {
      lifecycle.slots[index] = typeof value === 'function' ? value(lifecycle.slots[index]) : value;
    }];
  }
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (callback: typeof lifecycle.focus) => { lifecycle.focus = callback; },
  useLocalSearchParams: () => lifecycle.params,
  useRouter: () => navigation
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'span', Pressable: 'button', Text: 'span', View: 'div',
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ accessToken: 'token', user: { id: 'responder-a', role: 'EMERGENCY_RESPONDER' } })
}));
vi.mock('@/services/api/client', async () => import('../../../../services/api/client'));
vi.mock('../../shared/components/DashboardHeader', () => ({ DashboardHeader: () => null }));
vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('../../shared/components/ReportListItem', () => ({
  ReportListItem: vi.fn(({ statusLabel }: { statusLabel: string }) => `request-status:${statusLabel}`)
}));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../api/responderProgressApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/responderProgressApi')>(),
  updateResponderRequestProgress: vi.fn()
}));
vi.mock('../api/responderRequestsApi', () => ({
  listAssignedResponderRequests: vi.fn(), listPendingResponderRequests: vi.fn()
}));

const assigned: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011', residentId: 'resident-1', assignedResponderId: 'responder-a',
  status: 'ASSIGNED', assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 1, medicalNeeds: true, injuredPeople: 1,
  vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'ACCESSIBLE', contact: { name: 'Resident', phoneNumber: '+94-77-555-1234' },
  description: 'Medical assistance needed.',
  createdAt: '2026-09-24T10:00:00.000Z', updatedAt: '2026-09-24T10:00:00.000Z'
};
const pending: SafeResponseRequest = { ...assigned, id: 'pending', status: 'NEW', assignedResponderId: undefined };

function render() {
  lifecycle.cursor = 0;
  return ResponderDashboardScreen();
}

function tabButton(label: string) {
  const tree = render();
  const tabRow = tree.props.children.find((child: React.ReactElement<{ children?: React.ReactNode }>) =>
    React.isValidElement(child) && Array.isArray(child.props.children) &&
    child.props.children.some((tab: React.ReactElement<{ label?: string }>) => tab?.props?.label === label)
  );
  return tabRow.props.children.find((tab: React.ReactElement<{ label: string }>) => tab.props.label === label);
}

function selectTab(label: string) {
  tabButton(label).props.onPress();
}

function renderDetails() {
  lifecycle.cursor = 0;
  return ResponderRequestDetailsScreen();
}

function visibleStatuses() {
  return [...screenText(render()).matchAll(/request-status:(\w+)/g)].map((match) => match[1]);
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

type ButtonProps = {
  children?: React.ReactNode;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityState?: { disabled?: boolean; busy?: boolean };
  disabled?: boolean;
  onPress: () => void;
};

function screenButtons(node: React.ReactNode): ButtonProps[] {
  if (Array.isArray(node)) return node.flatMap(screenButtons);
  if (!React.isValidElement<ButtonProps>(node)) return [];
  if (typeof node.type === 'function') {
    return screenButtons((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  return node.props.accessibilityRole === 'button' ? [node.props] : screenButtons(node.props.children);
}

function detailsButton(label: string) {
  const button = screenButtons(renderDetails()).find((props) =>
    (props.accessibilityLabel ?? screenText(props.children).trim()) === label
  );
  expect(button, `Expected details button: ${label}`).toBeDefined();
  return button!;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  lifecycle.slots = [];
  lifecycle.params = {};
  vi.resetAllMocks();
  navigation.setParams.mockImplementation((params) => {
    lifecycle.params = { ...lifecycle.params, ...params };
  });
  vi.stubGlobal('React', React);
  clearResponderRequestCache();
  vi.mocked(listPendingResponderRequests).mockResolvedValue([pending]);
  vi.mocked(listAssignedResponderRequests).mockResolvedValue([assigned]);
});
afterEach(() => {
  clearResponderRequestCache();
  vi.unstubAllGlobals();
});

describe('cancelled requests in active responder queues (LDFEW-324)', () => {
  it('excludes terminal records from both tabs and their counts defensively', async () => {
    const cancelled = { ...assigned, id: 'cancelled', status: 'CANCELLED' as const };
    const completed = { ...assigned, id: 'completed', status: 'COMPLETED' as const };
    vi.mocked(listPendingResponderRequests).mockResolvedValue([pending, cancelled, completed]);
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([assigned, cancelled, completed]);

    render();
    lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).not.toContain('Loading requests...'));
    expect(visibleStatuses()).toEqual(['NEW']);
    expect(tabButton('Pending').props.count).toBe(1);
    selectTab('Assigned');
    expect(visibleStatuses()).toEqual(['ASSIGNED']);
    expect(tabButton('Assigned').props.count).toBe(1);
  });

  it('clears cancelled work and cached details on manual refresh, leaving an empty Pending queue', async () => {
    render();
    lifecycle.focus();
    await vi.waitFor(() => expect(getCachedResponderRequest(pending.id)).toEqual(pending));
    expect(visibleStatuses()).toEqual(['NEW']);
    expect(tabButton('Pending').props.count).toBe(1);

    // After Resident cancellation the next server response excludes the persisted record.
    const refresh = deferred<SafeResponseRequest[]>();
    vi.mocked(listPendingResponderRequests).mockReturnValueOnce(refresh.promise);
    render().props.children[0].props.onTrailingPress();
    expect(screenText(render())).toContain('Loading requests...');
    refresh.resolve([]);
    await vi.waitFor(() => expect(screenText(render())).not.toContain('Loading requests...'));

    expect(listPendingResponderRequests).toHaveBeenCalledTimes(2);
    expect(listPendingResponderRequests).toHaveBeenLastCalledWith('token');
    expect(visibleStatuses()).toEqual([]);
    expect(tabButton('Pending').props.count).toBe(0);
    expect(screenText(render())).toContain('No pending requests');
    expect(getCachedResponderRequest(pending.id)).toBeNull();
    selectTab('Assigned');
    expect(visibleStatuses()).toEqual(['ASSIGNED']);
    expect(tabButton('Assigned').props.count).toBe(1);
  });
});

describe('responder progress screen lifecycle and errors', () => {
  beforeEach(async () => {
    // Use the real API response validation and error mapping while controlling only the transport.
    const api = await vi.importActual<typeof import('../api/responderProgressApi')>('../api/responderProgressApi');
    vi.mocked(updateResponderRequestProgress).mockImplementation(api.updateResponderRequestProgress);
  });

  it('accepts NEW then completes every stage with loading protection, next actions, reopen and Assigned refresh', async () => {
    updateCachedResponderRequest({ ...assigned, status: 'NEW', assignedResponderId: undefined });
    lifecycle.params = { requestId: assigned.id, sourceTab: 'PENDING' };
    let confirmed: SafeResponseRequest = { ...assigned, acceptedAt: '2026-09-24T10:00:00.000Z' };
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([confirmed]);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(confirmed));
    vi.stubGlobal('fetch', fetchMock);
    detailsButton('Accept Request').onPress();
    await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Request accepted', 'Request accepted successfully.', expect.any(Array)
    ));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(`/response-requests/responder/requests/${assigned.id}/accept`),
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(getCachedResponderRequest(assigned.id)).toEqual(confirmed);
    vi.mocked(Alert.alert).mock.lastCall?.[2]?.[0]?.onPress?.();
    expect(navigation.replace).toHaveBeenCalledWith('/responder');

    lifecycle.slots = [];
    lifecycle.params = {};
    render();
    let blur = lifecycle.focus();
    await vi.waitFor(() => expect(screenText(render())).not.toContain('Loading requests...'));
    selectTab('Assigned');
    expect(visibleStatuses()).toEqual(['ASSIGNED']);
    let dashboardState = lifecycle.slots;

    const stages = [
      ['Start Dispatch', 'DISPATCHED', 'dispatchedAt', 'Mark as Arrived'],
      ['Mark as Arrived', 'ARRIVED', 'arrivedAt', 'Start Assistance'],
      ['Start Assistance', 'IN_PROGRESS', 'inProgressAt', 'Complete Request'],
      ['Complete Request', 'COMPLETED', 'completedAt', null]
    ] as const;
    for (const [index, [label, status, timestampField, nextLabel]] of stages.entries()) {
      blur?.();
      lifecycle.slots = [];
      lifecycle.params = { requestId: assigned.id, sourceTab: 'ASSIGNED' };
      const transport = deferred<Response>();
      fetchMock.mockReturnValueOnce(transport.promise);
      const button = detailsButton(label);
      const callsBefore = fetchMock.mock.calls.length;
      button.onPress();
      button.onPress();
      const loadingButton = detailsButton(label);
      expect(loadingButton.disabled).toBe(true);
      expect(loadingButton.accessibilityState).toEqual({ disabled: true, busy: true });
      expect(screenText(loadingButton.children)).toContain('Updating progress...');
      loadingButton.onPress();
      expect(fetchMock).toHaveBeenCalledTimes(callsBefore + 1);
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining(`/response-requests/${assigned.id}/progress`),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status }) })
      );
      expect(getCachedResponderRequest(assigned.id)).toEqual(confirmed);
      const timestamp = new Date(Date.parse(assigned.updatedAt) + (index + 1) * 60_000).toISOString();
      confirmed = { ...confirmed, status, [timestampField]: timestamp, updatedAt: timestamp };
      transport.resolve(jsonResponse(confirmed));
      await vi.waitFor(() => expect(getCachedResponderRequest(assigned.id)).toEqual(confirmed));
      expect(screenText(renderDetails())).toContain('Progress updated:');

      // Remount details to prove the next action comes from confirmed cache data, not local state.
      lifecycle.slots = [];
      if (nextLabel) expect(detailsButton(nextLabel).disabled).toBe(false);
      else {
        expect(screenText(renderDetails())).toContain('Emergency response completed');
        expect(screenButtons(renderDetails()).filter((props) =>
          stages.some(([label]) => label === props.accessibilityLabel)
        )).toEqual([]);
      }
      detailsButton('Back to requests').onPress();
      expect(navigation.dismissTo).toHaveBeenLastCalledWith({ pathname: '/responder', params: { tab: 'ASSIGNED' } });
      lifecycle.params = navigation.dismissTo.mock.lastCall![0].params;
      lifecycle.slots = dashboardState;
      vi.mocked(listAssignedResponderRequests).mockResolvedValue(status === 'COMPLETED' ? [] : [confirmed]);
      expect(tabButton('Assigned').props.active).toBe(true);
      blur = lifecycle.focus();
      await vi.waitFor(() => expect(screenText(render())).not.toContain('Loading requests...'));
      expect(visibleStatuses()).toEqual(status === 'COMPLETED' ? [] : [status]);
      expect(getCachedResponderRequest(pending.id)).toEqual(pending);
      dashboardState = lifecycle.slots;
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(getCachedResponderRequest(assigned.id)).toBeNull();
  });

  it.each([
    { name: 'network failure', response: () => Promise.reject(new Error('Raw internal network URL')), message: 'Check your connection' },
    { name: 'backend failure', response: () => Promise.resolve(jsonResponse({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Raw internal database error' } }, 500)), message: 'Unable to confirm' },
    { name: 'conflicting update', response: () => Promise.resolve(jsonResponse({ error: { code: 'REQUEST_PROGRESS_CONFLICT', message: 'Raw internal conflict' } }, 409)), message: 'This request has changed' },
    { name: 'malformed success', response: () => Promise.resolve(jsonResponse({ status: 'DISPATCHED' })), message: 'Unable to confirm the updated request' },
    { name: 'empty success', response: () => Promise.resolve(new Response(null, { status: 204 })), message: 'Unable to confirm the updated request' }
  ])('keeps confirmed state after $name, shows friendly feedback, and allows a manual retry', async ({ response, message }) => {
    updateCachedResponderRequest(assigned);
    lifecycle.params = { requestId: assigned.id, sourceTab: 'ASSIGNED' };
    const fetchMock = vi.fn<typeof fetch>().mockImplementationOnce(response);
    vi.stubGlobal('fetch', fetchMock);
    detailsButton('Start Dispatch').onPress();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain(message));
    expect(screenText(renderDetails())).not.toContain('Raw internal');
    expect(screenText(renderDetails())).toMatch(/Current status:\s+Assigned/);
    expect(getCachedResponderRequest(assigned.id)).toEqual(assigned);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const retryButton = detailsButton('Start Dispatch');
    expect(retryButton.disabled).toBe(false);
    expect(retryButton.accessibilityState).toEqual({ disabled: false, busy: false });

    const confirmed = { ...assigned, status: 'DISPATCHED' as const, dispatchedAt: '2026-09-24T10:01:00.000Z' };
    fetchMock.mockResolvedValueOnce(jsonResponse(confirmed));
    retryButton.onPress();
    await vi.waitFor(() => expect(getCachedResponderRequest(assigned.id)).toEqual(confirmed));
    expect(detailsButton('Mark as Arrived').disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screenText(renderDetails())).not.toContain(message);
  });

  it('revalidates an uncertain write on return and reopens the saved next action without retrying automatically', async () => {
    updateCachedResponderRequest(assigned);
    lifecycle.params = { requestId: assigned.id, sourceTab: 'ASSIGNED' };
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('Connection dropped after write'));
    vi.stubGlobal('fetch', fetchMock);
    detailsButton('Start Dispatch').onPress();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Check your connection'));
    expect(getCachedResponderRequest(assigned.id)).toEqual(assigned);
    detailsButton('Back to requests').onPress();
    lifecycle.params = navigation.dismissTo.mock.lastCall![0].params;
    lifecycle.slots = [];
    const saved = { ...assigned, status: 'DISPATCHED' as const, dispatchedAt: '2026-09-24T10:01:00.000Z' };
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([saved]);
    render();
    const blur = lifecycle.focus();
    await vi.waitFor(() => expect(visibleStatuses()).toEqual(['DISPATCHED']));
    blur?.();
    lifecycle.slots = [];
    lifecycle.params = { requestId: assigned.id, sourceTab: 'ASSIGNED' };
    expect(detailsButton('Mark as Arrived').disabled).toBe(false);
    expect(getCachedResponderRequest(assigned.id)).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('responder dashboard return navigation', () => {
  it.each(['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] as const)(
    'opens a %s request and returns to Assigned with its latest status', async (status) => {
      const current = { ...assigned, status };
      vi.mocked(listAssignedResponderRequests).mockResolvedValue([current]);
      render();
      const blur = lifecycle.focus();
      await vi.waitFor(() => expect(getCachedResponderRequest(assigned.id)).toEqual(current));
      selectTab('Assigned');
      expect(navigation.setParams).toHaveBeenLastCalledWith({ tab: 'ASSIGNED' });
      expect(visibleStatuses()).toEqual([status]);
      expect(vi.mocked(ReportListItem).mock.lastCall?.[0].href)
        .toBe(`/responder/requests/${assigned.id}?sourceTab=ASSIGNED`);
      const dashboardState = lifecycle.slots;
      blur?.();

      lifecycle.slots = [];
      lifecycle.params = { requestId: assigned.id, sourceTab: 'ASSIGNED' };
      const details = renderDetails();
      // The header Back and bottom Back to Requests use the same return destination.
      details.props.children[0].props.onBack();
      expect(navigation.dismissTo).toHaveBeenLastCalledWith({ pathname: '/responder', params: { tab: 'ASSIGNED' } });
      expect(navigation.replace).not.toHaveBeenCalled();
      lifecycle.params = navigation.dismissTo.mock.lastCall![0].params;
      lifecycle.slots = dashboardState;
      expect(tabButton('Assigned').props.active).toBe(true);
      const callsBefore = vi.mocked(listAssignedResponderRequests).mock.calls.length;
      lifecycle.focus();
      expect(listAssignedResponderRequests).toHaveBeenCalledTimes(callsBefore + 1);
      await vi.waitFor(() => expect(visibleStatuses()).toEqual([status]));
      expect(getCachedResponderRequest(pending.id)).toEqual(pending);
    }
  );

  it('restores Assigned on the first render of a new dashboard after progressing ARRIVED to IN_PROGRESS', async () => {
    updateCachedResponderRequest({ ...assigned, status: 'ARRIVED' });
    lifecycle.params = { requestId: assigned.id, sourceTab: 'ASSIGNED' };
    const updated = { ...assigned, status: 'IN_PROGRESS' as const };
    vi.mocked(updateResponderRequestProgress).mockResolvedValue(updated);
    const details = renderDetails();
    const progressSection = details.props.children[2];
    progressSection.props.children[2].props.onPress();
    await vi.waitFor(() => expect(getCachedResponderRequest(assigned.id)).toEqual(updated));
    const updatedDetails = renderDetails();
    updatedDetails.props.children.at(-1).props.onPress();
    expect(navigation.dismissTo).toHaveBeenLastCalledWith({ pathname: '/responder', params: { tab: 'ASSIGNED' } });
    lifecycle.slots = [];
    lifecycle.params = navigation.dismissTo.mock.lastCall![0].params;
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([updated]);
    expect(tabButton('Assigned').props.active).toBe(true);
    lifecycle.focus();
    await vi.waitFor(() => expect(visibleStatuses()).toEqual(['IN_PROGRESS']));
  });

  it('keeps Pending request Back navigation and the default dashboard on Pending', () => {
    expect(tabButton('Pending').props.active).toBe(true);
    updateCachedResponderRequest(pending);
    lifecycle.slots = [];
    lifecycle.params = { requestId: pending.id, sourceTab: 'PENDING' };
    renderDetails().props.children[0].props.onBack();
    expect(navigation.replace).toHaveBeenLastCalledWith('/responder');
    expect(navigation.dismissTo).not.toHaveBeenCalled();
  });

  it.each([{}, { requestId: 'missing' }, { requestId: 'missing', sourceTab: 'invalid' }])(
    'handles a direct link with unavailable request data and navigation state %j', (params) => {
      lifecycle.params = params;
      renderDetails().props.children[0].props.onBack();
      expect(navigation.replace).toHaveBeenLastCalledWith('/responder');
    }
  );

  it('shows confirmed progress immediately on return and revalidates every stage without duplicates', async () => {
    render();
    let blur = lifecycle.focus();
    await vi.waitFor(() => expect(getCachedResponderRequest(assigned.id)).toEqual(assigned));
    selectTab('Assigned');
    expect(visibleStatuses()).toEqual(['ASSIGNED']);

    for (const status of ['DISPATCHED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const) {
      blur?.();
      const confirmed = { ...assigned, status, updatedAt: '2026-09-24T10:01:00.000Z' };
      updateCachedResponderRequest(confirmed);
      const refresh = deferred<SafeResponseRequest[]>();
      vi.mocked(listAssignedResponderRequests).mockReturnValueOnce(refresh.promise);
      const callsBefore = vi.mocked(listAssignedResponderRequests).mock.calls.length;
      blur = lifecycle.focus();
      const expected = status === 'COMPLETED' ? [] : [status];
      expect(visibleStatuses()).toEqual(expected);
      expect(listAssignedResponderRequests).toHaveBeenCalledTimes(callsBefore + 1);
      expect(listAssignedResponderRequests).toHaveBeenLastCalledWith('token');

      refresh.resolve(status === 'COMPLETED' ? [] : [confirmed]);
      await vi.waitFor(() => expect(screenText(render())).not.toContain('Loading requests...'));
      expect(visibleStatuses()).toEqual(expected);
      if (status === 'DISPATCHED') {
        expect(getResponderProgressAction(getCachedResponderRequest(assigned.id), {
          id: 'responder-a', name: 'Responder', email: 'responder@example.com', role: 'EMERGENCY_RESPONDER'
        })?.label).toBe('Mark as Arrived');
      }
      selectTab('Pending');
      expect(visibleStatuses()).toEqual(['NEW']);
      selectTab('Assigned');
    }
    expect(getCachedResponderRequest(assigned.id)).toBeNull();
  });

  it('uses fresh backend status even when the cache still contains ASSIGNED', async () => {
    render();
    const blur = lifecycle.focus();
    await vi.waitFor(() => expect(getCachedResponderRequest(assigned.id)).toEqual(assigned));
    selectTab('Assigned');
    blur?.();
    const latest = { ...assigned, status: 'ARRIVED' as const };
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([latest, {
      ...latest, id: 'another-request', assignedResponderId: 'another-responder'
    }]);
    lifecycle.focus();
    await vi.waitFor(() => expect(getCachedResponderRequest(assigned.id)).toEqual(latest));
    expect(visibleStatuses()).toEqual(['ARRIVED']);
    expect(getCachedResponderRequest('another-request')).toBeNull();
  });

  it.each(['success', 'failure'] as const)('ignores a pre-navigation refresh %s after newer progress', async (outcome) => {
    const obsolete = deferred<SafeResponseRequest[]>();
    vi.mocked(listAssignedResponderRequests).mockReturnValueOnce(obsolete.promise);
    render();
    const blur = lifecycle.focus();
    blur?.();
    const latest = { ...assigned, status: 'DISPATCHED' as const };
    updateCachedResponderRequest(latest);
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([latest]);
    lifecycle.focus();
    selectTab('Assigned');
    await vi.waitFor(() => expect(visibleStatuses()).toEqual(['DISPATCHED']));
    if (outcome === 'success') obsolete.resolve([assigned]);
    else obsolete.reject(new Error('Old fetch failed'));
    await obsolete.promise.catch(() => undefined);
    await Promise.resolve();
    expect(visibleStatuses()).toEqual(['DISPATCHED']);
    expect(getCachedResponderRequest(assigned.id)).toEqual(latest);
  });
});
