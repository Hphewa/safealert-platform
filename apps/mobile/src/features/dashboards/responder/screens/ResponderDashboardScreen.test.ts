import * as React from 'react';
import type { SafeResponseRequest } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponderDashboardScreen } from './ResponderDashboardScreen';
import { listAssignedResponderRequests, listPendingResponderRequests } from '../api/responderRequestsApi';
import { clearResponderRequestCache, getCachedResponderRequest, updateCachedResponderRequest } from '../requestDetailsCache';
import { getResponderProgressAction } from '../progressUi';

// Exercise the screen's focus/blur callbacks and async loads without a native runtime.
const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  focus: (() => undefined) as () => (() => void) | undefined
}));
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
  useFocusEffect: (callback: typeof lifecycle.focus) => { lifecycle.focus = callback; }
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'span', Pressable: 'button', Text: 'span', View: 'div',
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ accessToken: 'token', user: { id: 'responder-a' } })
}));
vi.mock('@/services/api/client', async () => import('../../../../services/api/client'));
vi.mock('../../shared/components/DashboardHeader', () => ({ DashboardHeader: () => null }));
vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('../../shared/components/ReportListItem', () => ({
  ReportListItem: ({ statusLabel }: { statusLabel: string }) => `request-status:${statusLabel}`
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

function selectTab(label: string) {
  const tree = render();
  const tabRow = tree.props.children.find((child: React.ReactElement<{ children?: React.ReactNode }>) =>
    React.isValidElement(child) && Array.isArray(child.props.children) &&
    child.props.children.some((tab: React.ReactElement<{ label?: string }>) => tab?.props?.label === label)
  );
  tabRow.props.children.find((tab: React.ReactElement<{ label: string }>) => tab.props.label === label).props.onPress();
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
  vi.resetAllMocks();
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
