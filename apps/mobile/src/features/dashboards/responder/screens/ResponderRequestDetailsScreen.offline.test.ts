import * as React from 'react';
import type { SafeResponseRequest, SafeUser } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponderRequestDetailsScreen } from './ResponderRequestDetailsScreen';
import { saveResponderFieldUpdate } from '../api/responderFieldUpdateApi';
import { getResponderRequestById } from '../api/responderRequestsApi';
import {
  clearResponderRequestCache,
  getCachedResponderRequest,
  updateCachedResponderRequest
} from '../requestDetailsCache';
import { createResponderUpdateQueue, type ResponderUpdateQueue } from '../offline/responderUpdateQueue';
import { updateResponderRequestProgress } from '../api/responderProgressApi';

// Simulated React lifecycle and navigation mocks for lightweight component unit testing
const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  params: {} as Record<string, string | string[] | undefined>,
  focus: (() => undefined) as () => (() => void) | undefined,
  auth: {
    accessToken: 'valid-responder-token',
    user: {
      id: 'responder-1',
      name: 'Test Responder',
      email: 'responder@example.com',
      role: 'EMERGENCY_RESPONDER'
    } as SafeUser | null
  }
}));

const navigation = vi.hoisted(() => ({
  setParams: vi.fn(),
  replace: vi.fn(),
  dismissTo: vi.fn()
}));


const offlineState = vi.hoisted(() => ({
  connectivity: 'offline' as 'online' | 'offline' | 'unknown',
  queue: null as ResponderUpdateQueue | null,
  active: true
}));
vi.mock('../offline/useResponderOffline', async () => {
  const { saveResponderUpdate } = await import('../offline/saveResponderUpdate');
  return { useResponderOffline: () => {
    const queue = offlineState.queue!;
    return { ...queue.getSnapshot(lifecycle.auth.user?.id ?? ''), connectivity: offlineState.connectivity,
      reload: async () => { await queue.load(lifecycle.auth.user?.id ?? ''); },
      isCurrent: () => offlineState.active,
      saveUpdate: (input: Parameters<typeof saveResponderUpdate>[0]) => saveResponderUpdate(input, queue, () => offlineState.connectivity)
    };
  } };
});
const disk = new Map<string, string>();
const storage = {
  getItem: async (key: string) => disk.get(key) ?? null,
  setItem: vi.fn(async (key: string, value: string) => { disk.set(key, value); })
};

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
    return [
      lifecycle.slots[index],
      (value: unknown) => {
        lifecycle.slots[index] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(lifecycle.slots[index]) : value;
      }
    ];
  }
}));

vi.mock('expo-router', () => ({
  useFocusEffect: (callback: typeof lifecycle.focus) => { lifecycle.focus = callback; },
  useLocalSearchParams: () => lifecycle.params,
  useRouter: () => navigation
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'span',
  Pressable: 'button',
  Text: 'span',
  TextInput: 'input',
  View: 'div',
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: 'ios' }
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => lifecycle.auth
}));

vi.mock('@/services/api/client', async () => import('../../../../services/api/client'));

vi.mock('../api/responderFieldUpdateApi', () => ({
  saveResponderFieldUpdate: vi.fn()
}));

vi.mock('../api/responderRequestsApi', () => ({
  listAssignedResponderRequests: vi.fn(),
  listPendingResponderRequests: vi.fn(),
  getResponderRequestById: vi.fn()
}));

vi.mock('../api/responderProgressApi', () => ({
  updateResponderRequestProgress: vi.fn()
}));

vi.mock('../api/responderDecisionApi', () => ({
  acceptResponderRequest: vi.fn(),
  declineResponderRequest: vi.fn()
}));

vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => children
}));

vi.mock('../../shared/components/DashboardGlyph', () => ({
  DashboardGlyph: () => null
}));

const mockRequestId = '507f1f77bcf86cd799439011';

const baseAssignedRequest: SafeResponseRequest = {
  id: mockRequestId,
  residentId: 'resident-1',
  assignedResponderId: 'responder-1',
  status: 'ASSIGNED',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 2,
  injuredPeople: 1,
  medicalNeeds: true,
  vulnerablePeople: { children: 0, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'ACCESSIBLE',
  contact: { name: 'Resident User', phoneNumber: '+94-77-555-1234' },
  description: 'Resident requires medical triage.',
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z'
};

function renderDetails() {
  lifecycle.cursor = 0;
  return ResponderRequestDetailsScreen();
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

type TextInputProps = {
  accessibilityLabel?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  editable?: boolean;
  maxLength?: number;
  children?: React.ReactNode;
};

function screenInputs(node: React.ReactNode): TextInputProps[] {
  if (Array.isArray(node)) return node.flatMap(screenInputs);
  if (!React.isValidElement<TextInputProps>(node)) return [];
  if (typeof node.type === 'function') {
    return screenInputs((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  return node.type === 'input' ? [node.props] : screenInputs(node.props.children);
}

function getFieldNotesInput() {
  const inputs = screenInputs(renderDetails());
  return inputs.find((i) => i.accessibilityLabel === 'Field Update Notes');
}

function getSaveFieldUpdateButton() {
  const buttons = screenButtons(renderDetails());
  return buttons.find((b) => b.accessibilityLabel === 'Save Field Update');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  lifecycle.slots = [];
  lifecycle.params = { requestId: mockRequestId, sourceTab: 'ASSIGNED' };
  lifecycle.auth = {
    accessToken: 'valid-responder-token',
    user: {
      id: 'responder-1',
      name: 'Test Responder',
      email: 'responder@example.com',
      role: 'EMERGENCY_RESPONDER'
    }
  };
  vi.resetAllMocks();
  disk.clear();
  offlineState.active = true;
  offlineState.connectivity = 'offline';
  offlineState.queue = createResponderUpdateQueue(storage);
  await offlineState.queue.load('responder-1');
  clearResponderRequestCache();
  updateCachedResponderRequest(baseAssignedRequest);
  vi.mocked(getResponderRequestById).mockImplementation(async (id: string) => {
    return getCachedResponderRequest(id);
  });
});

afterEach(() => {
  clearResponderRequestCache();
  vi.unstubAllGlobals();
});

describe('LDFEW-328?331 responder offline screen integration', () => {
  it('uses the existing API online and creates no queue entry', async () => {
    offlineState.connectivity = 'online';
    vi.mocked(saveResponderFieldUpdate).mockResolvedValue({ ...baseAssignedRequest, fieldNotes: 'Resident reached safely.' });
    getFieldNotesInput()?.onChangeText?.('Resident reached safely.');
    getSaveFieldUpdateButton()?.onPress();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Field update saved successfully.'));
    expect(saveResponderFieldUpdate).toHaveBeenCalledWith(mockRequestId, 'Resident reached safely.', 'valid-responder-token');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('shows connectivity changes and saves locally with no backend call or server-cache mutation', async () => {
    offlineState.connectivity = 'online';
    expect(screenText(renderDetails())).not.toContain("You're offline");
    offlineState.connectivity = 'offline';
    expect(screenText(renderDetails())).toContain("You're offline");
    getFieldNotesInput()?.onChangeText?.('Road access blocked.');
    const save = getSaveFieldUpdateButton();
    save?.onPress(); save?.onPress();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Saved offline'));
    expect(screenText(renderDetails())).toContain('1 update pending sync');
    expect(saveResponderFieldUpdate).not.toHaveBeenCalled();
    expect(offlineState.queue?.getSnapshot('responder-1').items).toHaveLength(1);
    expect(getCachedResponderRequest(mockRequestId)).toEqual(baseAssignedRequest);
  });

  it('keeps sequential local lifecycle updates through remount and storage reload without syncing on reconnect', async () => {
    const press = (label: string) => screenButtons(renderDetails()).find((button) => button.accessibilityLabel === label)?.onPress();
    press('Start Dispatch');
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Local progress (pending sync): Dispatched'));
    press('Mark as Arrived');
    await vi.waitFor(() => expect(offlineState.queue?.getSnapshot('responder-1').items).toHaveLength(2));
    lifecycle.slots = [];
    offlineState.queue = createResponderUpdateQueue(storage);
    await offlineState.queue.load('responder-1');
    expect(screenText(renderDetails())).toContain('Last confirmed server status: Assigned');
    expect(screenText(renderDetails())).toContain('Local progress (pending sync): Arrived');
    offlineState.connectivity = 'online';
    press('Start Assistance');
    await vi.waitFor(() => expect(offlineState.queue?.getSnapshot('responder-1').items).toHaveLength(3));
    expect(updateResponderRequestProgress).not.toHaveBeenCalled();
    expect(getCachedResponderRequest(mockRequestId)?.status).toBe('ASSIGNED');
  });

  it('requires completion details locally and distinguishes local completion from server confirmation', async () => {
    updateCachedResponderRequest({ ...baseAssignedRequest, status: 'IN_PROGRESS' });
    const complete = () => screenButtons(renderDetails()).find((button) => button.accessibilityLabel === 'Complete Request')?.onPress();
    complete();
    expect(screenText(renderDetails())).toContain('Assistance provided is required');
    expect(storage.setItem).not.toHaveBeenCalled();
    screenInputs(renderDetails()).find((input) => input.accessibilityLabel === 'Assistance Provided')?.onChangeText?.('Transport to shelter.');
    screenInputs(renderDetails()).find((input) => input.accessibilityLabel === 'Completion Summary')?.onChangeText?.('Resident safe in shelter.');
    complete();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Completion saved on this device'));
    expect(screenText(renderDetails())).not.toContain('Emergency response completed');
    expect(updateResponderRequestProgress).not.toHaveBeenCalled();
  });

  it('shows a storage error without losing the draft and allows a safe local retry', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('storage full'));
    getFieldNotesInput()?.onChangeText?.('Road access blocked.');
    getSaveFieldUpdateButton()?.onPress();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Your update was not saved'));
    expect(getFieldNotesInput()?.value).toBe('Road access blocked.');
    expect(offlineState.queue?.getSnapshot('responder-1').items).toEqual([]);
    getSaveFieldUpdateButton()?.onPress();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Saved offline'));
  });

  it('treats unknown connectivity conservatively and blocks a changed server lifecycle', async () => {
    offlineState.connectivity = 'unknown';
    getFieldNotesInput()?.onChangeText?.('Road access blocked.');
    getSaveFieldUpdateButton()?.onPress();
    await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Saved offline'));
    updateCachedResponderRequest({ ...baseAssignedRequest, status: 'DISPATCHED' });
    expect(screenText(renderDetails())).toContain('Pending updates need review');
    expect(getSaveFieldUpdateButton()?.disabled).toBe(true);
  });

  it('retains queued work after leaving during a write without applying stale UI feedback', async () => {
    const gate = deferred<void>();
    storage.setItem.mockImplementationOnce(async (key, value) => { await gate.promise; disk.set(key, value); });
    getFieldNotesInput()?.onChangeText?.('Road access blocked.');
    getSaveFieldUpdateButton()?.onPress();
    offlineState.active = false;
    gate.resolve();
    await vi.waitFor(() => expect(offlineState.queue?.getSnapshot('responder-1').items).toHaveLength(1));
    expect(screenText(renderDetails())).not.toContain('Saved offline');
  });

  it('blocks saving on unreadable storage and exposes an explicit retry', async () => {
    disk.set('safealert.responder-updates.v1.responder-1', '{broken');
    await offlineState.queue?.load('responder-1');
    expect(getSaveFieldUpdateButton()?.disabled).toBe(true);
    expect(screenText(renderDetails())).toContain('Saved updates could not be read');
    expect(screenButtons(renderDetails()).some((button) => button.accessibilityLabel === 'Retry reading saved updates')).toBe(true);
  });

  it('explains a cold-start request cache miss while retaining the pending queue', async () => {
    await offlineState.queue?.enqueue('responder-1', baseAssignedRequest, { type: 'field-update', payload: { fieldNotes: 'Road access blocked.' } });
    clearResponderRequestCache();
    renderDetails();
    lifecycle.focus();
    expect(screenText(renderDetails())).toContain('Connect to load this request');
    expect(screenText(renderDetails())).toContain('1 update pending sync');
    expect(getResponderRequestById).not.toHaveBeenCalled();
  });
});
