import * as React from 'react';
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
vi.mock('../api/responderProgressApi', () => ({ updateResponderRequestProgress: vi.fn() }));
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
