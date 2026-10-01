import * as React from 'react';
import type { SafeResponseRequest, UserRole } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildResidentEmergencyRequestProgress,
  presentResidentEmergencyRequest,
  presentResidentEmergencyRequestDetails,
  residentEmergencyRequestEditUnavailableMessage
} from '../../resident/emergencyRequestPresentation';
import { EmergencyRequestProgressTracker } from '../../resident/components/EmergencyRequestProgressTracker';
import {
  clearResponderRequestCache,
  getCachedResponderRequest,
  replaceResponderRequestCache,
  updateCachedResponderRequest
} from '../requestDetailsCache';
import { canManageResponderProgress, getResponderProgressAction } from '../progressUi';
import { emptyQueueDescription, emptyQueueTitle } from '../requestFlowState';
import { parseResponderRequestTab, responderRequestDetailsHref, responderRequestReturnTab } from '../requestDetails';
import { getResponderQueueCounts, getVisibleResponderRequests } from '../queueState';
import { ResponderRequestDetailsScreen } from './ResponderRequestDetailsScreen';

const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  params: {} as Record<string, string | string[] | undefined>,
  focus: (() => undefined) as () => (() => void) | undefined
}));

const navigation = vi.hoisted(() => ({
  setParams: vi.fn(),
  replace: vi.fn(),
  dismissTo: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn()
}));

const authState = vi.hoisted(() => ({
  accessToken: 'valid-responder-token' as string | null,
  user: { id: 'responder-carol', role: 'EMERGENCY_RESPONDER' as UserRole } as { id: string; role: UserRole } | null
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
  useFocusEffect: (callback: typeof lifecycle.focus) => { lifecycle.focus = callback; },
  useLocalSearchParams: () => lifecycle.params,
  useRouter: () => navigation
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'activity-indicator',
  Pressable: 'pressable',
  Text: 'text',
  TextInput: 'text-input',
  View: 'view',
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
  StyleSheet: { create: (styles: unknown) => styles }
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => authState
}));

vi.mock('@/services/api/client', async () => import('../../../../services/api/client'));
vi.mock('../../shared/components/DashboardHeader', () => ({ DashboardHeader: () => null }));
vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/components/StatusBadge', () => ({ StatusBadge: () => null }));

vi.mock('../api/responderRequestsApi', () => ({
  listAssignedResponderRequests: vi.fn(),
  listPendingResponderRequests: vi.fn(),
  getResponderRequestById: vi.fn()
}));

const baseRequest: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011',
  residentId: 'resident-alice',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 3,
  medicalNeeds: true,
  injuredPeople: 1,
  vulnerablePeople: { children: 1, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'ACCESSIBLE',
  contact: { name: 'Resident Alice', phoneNumber: '+94-77-555-1234', email: 'alice@example.com' },
  description: 'Emergency evacuation required.',
  status: 'NEW',
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z'
};

function renderDetails() {
  lifecycle.cursor = 0;
  return ResponderRequestDetailsScreen();
}

interface TestElement {
  type?: unknown;
  props?: {
    children?: unknown;
    style?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

function findNoticeCard(tree: unknown): TestElement | undefined {
  const el = tree as TestElement | null | undefined;
  const children = Array.isArray(el?.props?.children) ? el?.props?.children : [el?.props?.children];
  return children.find((c): c is TestElement => {
    const child = c as TestElement | null | undefined;
    return child?.props?.style?.alignItems === 'center';
  });
}

function findTextInElement(element: unknown, text: string): boolean {
  if (!element) return false;
  if (typeof element === 'string') return element.includes(text);
  if (Array.isArray(element)) return element.some((child) => findTextInElement(child, text));
  const el = element as TestElement;
  if (typeof el.type === 'function') {
    try {
      return findTextInElement((el.type as (props?: unknown) => unknown)(el.props), text);
    } catch {
      return false;
    }
  }
  if (el.props?.children) return findTextInElement(el.props.children, text);
  return false;
}

beforeEach(() => {
  lifecycle.slots = [];
  lifecycle.cursor = 0;
  lifecycle.params = {};
  clearResponderRequestCache();
  vi.clearAllMocks();
  authState.accessToken = 'valid-responder-token';
  authState.user = { id: 'responder-carol', role: 'EMERGENCY_RESPONDER' };
});

afterEach(() => {
  clearResponderRequestCache();
  vi.restoreAllMocks();
});

describe('LDFEW-392: Resident / Responder Status Synchronization', () => {
  it('correctly maps each lifecycle status from NEW through COMPLETED for resident tracking', () => {
    const statuses = ['NEW', 'ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
    const expectedLabels = {
      NEW: 'Submitted',
      ASSIGNED: 'Assigned',
      DISPATCHED: 'Dispatched',
      ARRIVED: 'Arrived',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled'
    };

    for (const status of statuses) {
      const summary = presentResidentEmergencyRequest({ ...baseRequest, status });
      expect(summary.status).toBe(expectedLabels[status]);
    }
  });

  it('builds full sequential progress stages reflecting reached, current, and future milestones', () => {
    // When status is ARRIVED: NEW, ASSIGNED, DISPATCHED are reached; ARRIVED is current; IN_PROGRESS, COMPLETED are future
    const stages = buildResidentEmergencyRequestProgress('ARRIVED');
    expect(stages).not.toBeNull();
    expect(stages).toHaveLength(6);

    expect(stages![0]).toMatchObject({ status: 'NEW', label: 'Submitted', state: 'reached' });
    expect(stages![1]).toMatchObject({ status: 'ASSIGNED', label: 'Assigned', state: 'reached' });
    expect(stages![2]).toMatchObject({ status: 'DISPATCHED', label: 'Dispatched', state: 'reached' });
    expect(stages![3]).toMatchObject({ status: 'ARRIVED', label: 'Arrived', state: 'current' });
    expect(stages![4]).toMatchObject({ status: 'IN_PROGRESS', label: 'In Progress', state: 'future' });
    expect(stages![5]).toMatchObject({ status: 'COMPLETED', label: 'Completed', state: 'future' });
  });

  it('presents completion details when COMPLETED, while strictly excluding responderRemarks and fieldNotes', () => {
    const completedRequest: SafeResponseRequest = {
      ...baseRequest,
      status: 'COMPLETED',
      assignedResponderId: 'responder-carol',
      completedAt: '2026-09-24T12:00:00.000Z',
      assistanceProvided: 'First aid and blankets provided.',
      completionSummary: 'Resident safely escorted to relief center.',
      responderRemarks: 'Confidential responder remark for operations.',
      fieldNotes: 'Internal field operational updates.'
    };

    const details = presentResidentEmergencyRequestDetails(completedRequest);
    expect(details.status).toBe('Completed');

    const completionSection = details.sections.find((s) => s.title === 'Completion Details');
    expect(completionSection).toBeDefined();

    const fields = completionSection!.fields;
    const labels = fields.map((f) => f.label);
    const values = fields.map((f) => f.value);

    expect(labels).toContain('Completed at');
    expect(labels).toContain('Assistance provided');
    expect(labels).toContain('Completion summary');
    expect(values).toContain('First aid and blankets provided.');
    expect(values).toContain('Resident safely escorted to relief center.');

    // Verify operational remarks and internal field notes are NEVER exposed in resident details
    expect(labels).not.toContain('Responder remarks');
    expect(labels).not.toContain('Field notes');
    const allDetailValues = details.sections.flatMap((s) => s.fields.map((f) => f.value));
    expect(allDetailValues).not.toContain('Confidential responder remark for operations.');
    expect(allDetailValues).not.toContain('Internal field operational updates.');
  });

  it('displays Request cancelled when request is cancelled, indicating it is no longer active', () => {
    const cancelledTracker = EmergencyRequestProgressTracker({ status: 'CANCELLED' });
    expect(cancelledTracker).toBeDefined();
    expect(findTextInElement(cancelledTracker, 'Request cancelled')).toBe(true);
  });

  it('explains why editing is unavailable when request is accepted by a responder or in later stages', () => {
    expect(residentEmergencyRequestEditUnavailableMessage('ASSIGNED')).toBe(
      'This request can no longer be edited because an Emergency Responder has already accepted it.'
    );
    expect(residentEmergencyRequestEditUnavailableMessage('DISPATCHED')).toBe(
      'This request can no longer be edited because an Emergency Responder has already accepted it.'
    );
    expect(residentEmergencyRequestEditUnavailableMessage('COMPLETED')).toBe(
      'Completed requests cannot be edited.'
    );
    expect(residentEmergencyRequestEditUnavailableMessage('CANCELLED')).toBe(
      'Cancelled requests cannot be edited.'
    );
    expect(residentEmergencyRequestEditUnavailableMessage('NEW')).toBeNull();
  });
});

describe('LDFEW-399: Loading, Empty, Success, Failure and Retry States', () => {
  it('displays loading indicator during initial fetch when request is refreshing and not in cache', () => {
    lifecycle.params = { requestId: '507f1f77bcf86cd799439011' };
    lifecycle.slots[0] = null; // updatedRequest
    lifecycle.slots[12] = true; // isRefreshing (slot 12)

    const tree = renderDetails();
    const noticeCard = findNoticeCard(tree);
    expect(noticeCard).toBeDefined();
    expect(findTextInElement(noticeCard, 'Loading request details...')).toBe(true);
  });

  it('presents friendly empty queue titles and descriptions for Pending and Assigned queues', () => {
    expect(emptyQueueTitle('PENDING')).toBe('No pending requests');
    expect(emptyQueueDescription('PENDING')).toBe(
      'There are currently no emergency requests waiting for response.'
    );

    expect(emptyQueueTitle('ASSIGNED')).toBe('No assigned requests');
    expect(emptyQueueDescription('ASSIGNED')).toBe(
      'There are currently no emergency requests assigned to you.'
    );
  });

  it('handles empty queue counts and filtering gracefully', () => {
    const counts = getResponderQueueCounts({ pending: [], assigned: [] });
    expect(counts).toEqual({ PENDING: 0, ASSIGNED: 0 });

    const visiblePending = getVisibleResponderRequests({ pending: [], assigned: [] }, 'PENDING');
    expect(visiblePending).toEqual([]);

    const visibleAssigned = getVisibleResponderRequests({ pending: [], assigned: [] }, 'ASSIGNED');
    expect(visibleAssigned).toEqual([]);
  });

  it('renders Retry button and connection error message on network failure', () => {
    lifecycle.params = { requestId: '507f1f77bcf86cd799439011' };
    lifecycle.slots[0] = null; // updatedRequest
    lifecycle.slots[12] = false; // isRefreshing = false
    lifecycle.slots[13] = 'Unable to refresh request details. Please check your connection and try again.'; // refreshError (slot 13)

    const tree = renderDetails();
    const noticeCard = findNoticeCard(tree);
    expect(noticeCard).toBeDefined();

    expect(findTextInElement(noticeCard, 'Request not available')).toBe(true);
    expect(
      findTextInElement(noticeCard, 'Unable to refresh request details. Please check your connection and try again.')
    ).toBe(true);

    // Check Retry button is present in the card
    expect(findTextInElement(noticeCard, 'Retry')).toBe(true);
  });

  it('renders Request not available without Retry button on 404 not found error', () => {
    lifecycle.params = { requestId: '507f1f77bcf86cd799439011' };
    lifecycle.slots[0] = null;
    lifecycle.slots[12] = false;
    lifecycle.slots[13] = 'This emergency request could not be found.';

    const tree = renderDetails();
    const noticeCard = findNoticeCard(tree);
    expect(noticeCard).toBeDefined();

    expect(findTextInElement(noticeCard, 'Request not available')).toBe(true);
    expect(findTextInElement(noticeCard, 'This emergency request could not be found.')).toBe(true);

    // No retry button on 404
    expect(findTextInElement(noticeCard, 'Retry')).toBe(false);
  });
});

describe('LDFEW-400: Authorization and Invalid Action Guards', () => {
  it('renders Access Restricted card when responder is not authorized to view the request (403)', () => {
    lifecycle.params = { requestId: '507f1f77bcf86cd799439011' };
    lifecycle.slots[0] = null;
    lifecycle.slots[12] = false;
    lifecycle.slots[13] = 'You are not authorized to view this emergency request.';

    const tree = renderDetails();
    const noticeCard = findNoticeCard(tree);
    expect(noticeCard).toBeDefined();

    expect(findTextInElement(noticeCard, 'Access Restricted')).toBe(true);
    expect(
      findTextInElement(noticeCard, 'You are not authorized to view this emergency request.')
    ).toBe(true);

    // No retry button on 403 access restriction
    expect(findTextInElement(noticeCard, 'Retry')).toBe(false);
  });

  it('prevents cache leakage: unassigned or another responder assigned request is NOT displayed from cache', () => {
    // Seed cache with a request assigned to another responder (dave)
    const otherResponderRequest: SafeResponseRequest = {
      ...baseRequest,
      status: 'ASSIGNED',
      assignedResponderId: 'responder-dave'
    };
    updateCachedResponderRequest(otherResponderRequest);

    // Current user is responder-carol
    lifecycle.params = { requestId: otherResponderRequest.id };
    lifecycle.slots[0] = null; // updatedRequest
    lifecycle.slots[9] = false;
    lifecycle.slots[10] = null;

    // Render details: responseRequest should resolve to null (safeCached filters out responder-dave request)
    const tree = renderDetails();
    const noticeCard = findNoticeCard(tree);
    expect(noticeCard).toBeDefined();

    // The unauthorized request was NOT rendered
    expect(findTextInElement(noticeCard, 'Request not available')).toBe(true);
  });

  it('prevents progress management if the current responder is not the assigned responder', () => {
    const assignedToDave: SafeResponseRequest = {
      ...baseRequest,
      status: 'ASSIGNED',
      assignedResponderId: 'responder-dave'
    };

    const carolUser = { id: 'responder-carol', name: 'Carol', email: 'carol@example.com', role: 'EMERGENCY_RESPONDER' as UserRole };
    const daveUser = { id: 'responder-dave', name: 'Dave', email: 'dave@example.com', role: 'EMERGENCY_RESPONDER' as UserRole };
    const aliceUser = { id: 'resident-alice', name: 'Alice', email: 'alice@example.com', role: 'RESIDENT' as UserRole };

    expect(canManageResponderProgress(assignedToDave, carolUser)).toBe(false);
    expect(canManageResponderProgress(assignedToDave, daveUser)).toBe(true);
    expect(canManageResponderProgress(assignedToDave, aliceUser)).toBe(false);
  });

  it('determines valid sequential next progress action labels', () => {
    const user = { id: 'responder-carol', name: 'Carol', email: 'carol@example.com', role: 'EMERGENCY_RESPONDER' as UserRole };

    // ASSIGNED -> Start Dispatch (DISPATCHED)
    const assignedReq: SafeResponseRequest = { ...baseRequest, status: 'ASSIGNED', assignedResponderId: user.id };
    expect(getResponderProgressAction(assignedReq, user)).toEqual({
      nextStatus: 'DISPATCHED',
      label: 'Start Dispatch'
    });

    // DISPATCHED -> Mark as Arrived (ARRIVED)
    const dispatchedReq: SafeResponseRequest = { ...assignedReq, status: 'DISPATCHED' };
    expect(getResponderProgressAction(dispatchedReq, user)).toEqual({
      nextStatus: 'ARRIVED',
      label: 'Mark as Arrived'
    });

    // ARRIVED -> Start Assistance (IN_PROGRESS)
    const arrivedReq: SafeResponseRequest = { ...assignedReq, status: 'ARRIVED' };
    expect(getResponderProgressAction(arrivedReq, user)).toEqual({
      nextStatus: 'IN_PROGRESS',
      label: 'Start Assistance'
    });

    // IN_PROGRESS -> Complete Request (COMPLETED)
    const inProgressReq: SafeResponseRequest = { ...assignedReq, status: 'IN_PROGRESS' };
    expect(getResponderProgressAction(inProgressReq, user)).toEqual({
      nextStatus: 'COMPLETED',
      label: 'Complete Request'
    });

    // COMPLETED -> no further progress actions
    const completedReq: SafeResponseRequest = { ...assignedReq, status: 'COMPLETED' };
    expect(getResponderProgressAction(completedReq, user)).toBeNull();
  });
});

describe('LDFEW-401: Refresh, Navigation, and Logout Persistence', () => {
  it('clears all cached requests on logout to protect against cross-session data leakage', () => {
    replaceResponderRequestCache([baseRequest, { ...baseRequest, id: 'req-2' }]);
    expect(getCachedResponderRequest(baseRequest.id)).toBeDefined();
    expect(getCachedResponderRequest('req-2')).toBeDefined();

    clearResponderRequestCache();

    expect(getCachedResponderRequest(baseRequest.id)).toBeNull();
    expect(getCachedResponderRequest('req-2')).toBeNull();
  });

  it('parses responder request tabs and defaults safely', () => {
    expect(parseResponderRequestTab('PENDING')).toBe('PENDING');
    expect(parseResponderRequestTab('ASSIGNED')).toBe('ASSIGNED');
    expect(parseResponderRequestTab('INVALID')).toBeUndefined();
    expect(parseResponderRequestTab(undefined)).toBeUndefined();
  });

  it('determines the correct return tab after decision or progress actions', () => {
    // When returning from an active assigned request without source state (direct link), returns to ASSIGNED tab
    expect(responderRequestReturnTab(undefined, 'ASSIGNED')).toBe('ASSIGNED');
    expect(responderRequestReturnTab(undefined, 'DISPATCHED')).toBe('ASSIGNED');
    expect(responderRequestReturnTab(undefined, 'IN_PROGRESS')).toBe('ASSIGNED');

    // When sourceTab is specified, preserves the sourceTab
    expect(responderRequestReturnTab('ASSIGNED', 'COMPLETED')).toBe('ASSIGNED');
    expect(responderRequestReturnTab('PENDING', 'NEW')).toBe('PENDING');
    expect(responderRequestReturnTab('PENDING', 'ASSIGNED')).toBe('PENDING');
  });

  it('builds details route href preserving the source tab', () => {
    expect(responderRequestDetailsHref('507f1f77bcf86cd799439011', 'ASSIGNED')).toBe(
      '/responder/requests/507f1f77bcf86cd799439011?sourceTab=ASSIGNED'
    );
    expect(responderRequestDetailsHref('507f1f77bcf86cd799439011', 'PENDING')).toBe(
      '/responder/requests/507f1f77bcf86cd799439011?sourceTab=PENDING'
    );
  });
});
