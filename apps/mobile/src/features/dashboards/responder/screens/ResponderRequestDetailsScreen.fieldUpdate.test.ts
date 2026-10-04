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
import { ApiClientError } from '../../../../services/api/client';

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


// Existing regression scenarios run online with an empty queue; offline cases have a dedicated suite.
vi.mock('../offline/useResponderOffline', async () => {
  const { createResponderUpdateQueue } = await import('../offline/responderUpdateQueue');
  const { saveResponderUpdate } = await import('../offline/saveResponderUpdate');
  const queue = createResponderUpdateQueue({ getItem: async () => null, setItem: async () => undefined });
  const ready = { items: [], status: 'ready' as const, error: null };
  return { useResponderOffline: () => ({
    ...ready, connectivity: 'online', reload: async () => undefined, isCurrent: () => true,
    saveUpdate: (input: Parameters<typeof saveResponderUpdate>[0]) =>
      saveResponderUpdate(input, { ...queue, getSnapshot: () => ready }, () => 'online')
  }) };
});

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

beforeEach(() => {
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

describe('LDFEW-351: Field Update UI Section in Responder Request Details', () => {
  describe('UI Layout and Initial Render', () => {
    it('renders the FIELD UPDATE section heading, helper text, and input controls for assigned request', () => {
      const rendered = renderDetails();
      const text = screenText(rendered);

      expect(text).toContain('FIELD UPDATE');
      expect(text).toContain('Record on-site observations, status updates, or coordination notes');

      const input = getFieldNotesInput();
      expect(input).toBeDefined();
      expect(input?.placeholder).toContain('Record operational observations, hazards encountered');
      expect(input?.maxLength).toBe(2000);

      const saveButton = getSaveFieldUpdateButton();
      expect(saveButton).toBeDefined();
      expect(screenText(saveButton?.children)).toContain('Save Field Update');
    });

    it('displays previously saved field notes if they exist on the response request', () => {
      const requestWithExistingNotes: SafeResponseRequest = {
        ...baseAssignedRequest,
        fieldNotes: 'Previous note: road cleared using alternate path.',
        fieldUpdatedAt: '2026-09-24T10:15:00.000Z'
      };
      updateCachedResponderRequest(requestWithExistingNotes);

      const text = screenText(renderDetails());
      expect(text).toContain('PREVIOUSLY SAVED UPDATE');
      expect(text).toContain('Previous note: road cleared using alternate path.');

      const input = getFieldNotesInput();
      expect(input?.value).toBe('Previous note: road cleared using alternate path.');
    });
  });

  describe('Input Validation (Client-Side)', () => {
    it('shows validation error when attempting to save empty notes and does not call API', async () => {
      const input = getFieldNotesInput();
      input?.onChangeText?.('');

      const saveBtn = getSaveFieldUpdateButton();
      saveBtn?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Field update notes cannot be empty.');
      expect(saveResponderFieldUpdate).not.toHaveBeenCalled();
    });

    it('shows validation error when attempting to save whitespace-only notes and does not call API', async () => {
      const input = getFieldNotesInput();
      input?.onChangeText?.('    \n\t  ');

      const saveBtn = getSaveFieldUpdateButton();
      saveBtn?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Field update notes cannot be empty.');
      expect(saveResponderFieldUpdate).not.toHaveBeenCalled();
    });

    it('shows validation error when notes are shorter than 3 characters and does not call API', async () => {
      const input = getFieldNotesInput();
      input?.onChangeText?.('ab');

      const saveBtn = getSaveFieldUpdateButton();
      saveBtn?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Field update notes must be at least 3 characters.');
      expect(saveResponderFieldUpdate).not.toHaveBeenCalled();
    });

    it('shows validation error when notes exceed 2000 characters and does not call API', async () => {
      const input = getFieldNotesInput();
      input?.onChangeText?.('a'.repeat(2001));

      const saveBtn = getSaveFieldUpdateButton();
      saveBtn?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Field update notes must be at most 2000 characters.');
      expect(saveResponderFieldUpdate).not.toHaveBeenCalled();
    });

    it('clears field update error dynamically when user types to correct input', async () => {
      const input = getFieldNotesInput();
      input?.onChangeText?.('');

      const saveBtn = getSaveFieldUpdateButton();
      saveBtn?.onPress();

      expect(screenText(renderDetails())).toContain('Field update notes cannot be empty.');

      // Start typing
      getFieldNotesInput()?.onChangeText?.('Road cleared.');

      expect(screenText(renderDetails())).not.toContain('Field update notes cannot be empty.');
    });
  });

  describe('Successful Save and Payload Verification', () => {
    it('triggers saveResponderFieldUpdate with trimmed notes, token, and no responderId in payload', async () => {
      const updatedResponse: SafeResponseRequest = {
        ...baseAssignedRequest,
        fieldNotes: 'Reached entrance. Minor debris being cleared.',
        fieldUpdatedAt: '2026-09-24T10:20:00.000Z'
      };
      vi.mocked(saveResponderFieldUpdate).mockResolvedValueOnce(updatedResponse);

      const input = getFieldNotesInput();
      input?.onChangeText?.('  Reached entrance. Minor debris being cleared.  ');

      const saveBtn = getSaveFieldUpdateButton();
      await saveBtn?.onPress();

      // Verify that the API call is made with the trimmed note and accessToken ONLY.
      // Responder identity MUST NOT be sent in the client payload.
      expect(saveResponderFieldUpdate).toHaveBeenCalledTimes(1);
      expect(saveResponderFieldUpdate).toHaveBeenCalledWith(
        mockRequestId,
        'Reached entrance. Minor debris being cleared.',
        'valid-responder-token'
      );

      const text = screenText(renderDetails());
      expect(text).toContain('Field update saved successfully.');
      expect(text).toContain('PREVIOUSLY SAVED UPDATE');
      expect(text).toContain(new Date('2026-09-24T10:20:00.000Z').toLocaleString());
      expect(getCachedResponderRequest(mockRequestId)?.fieldNotes).toBe(
        'Reached entrance. Minor debris being cleared.'
      );
      expect(getCachedResponderRequest(mockRequestId)?.fieldUpdatedAt).toBe(
        '2026-09-24T10:20:00.000Z'
      );
    });

    it('updates displayed timestamp when a subsequent field update is saved', async () => {
      // Seed with initial update
      const initialSaved: SafeResponseRequest = {
        ...baseAssignedRequest,
        fieldNotes: 'First update at entrance.',
        fieldUpdatedAt: '2026-09-24T10:15:00.000Z'
      };
      updateCachedResponderRequest(initialSaved);

      expect(screenText(renderDetails())).toContain(new Date('2026-09-24T10:15:00.000Z').toLocaleString());

      // Subsequent update
      const secondUpdate: SafeResponseRequest = {
        ...initialSaved,
        fieldNotes: 'Second update: corridor cleared.',
        fieldUpdatedAt: '2026-09-24T10:35:00.000Z'
      };
      vi.mocked(saveResponderFieldUpdate).mockResolvedValueOnce(secondUpdate);

      const input = getFieldNotesInput();
      input?.onChangeText?.('Second update: corridor cleared.');

      const saveBtn = getSaveFieldUpdateButton();
      await saveBtn?.onPress();

      const updatedText = screenText(renderDetails());
      expect(updatedText).toContain('Second update: corridor cleared.');
      expect(updatedText).toContain(new Date('2026-09-24T10:35:00.000Z').toLocaleString());
      expect(getCachedResponderRequest(mockRequestId)?.fieldUpdatedAt).toBe('2026-09-24T10:35:00.000Z');
    });

    it('shows loading state while saving and disables the save button', async () => {
      const pendingSave = deferred<SafeResponseRequest>();
      vi.mocked(saveResponderFieldUpdate).mockReturnValueOnce(pendingSave.promise);

      const input = getFieldNotesInput();
      input?.onChangeText?.('Valid operational update in progress.');

      const saveBtn = getSaveFieldUpdateButton();
      void saveBtn?.onPress();

      // Inspect UI while in-flight
      const inFlightBtn = getSaveFieldUpdateButton();
      expect(inFlightBtn?.disabled).toBe(true);
      expect(inFlightBtn?.accessibilityState?.busy).toBe(true);
      expect(screenText(inFlightBtn?.children)).toContain('Saving update...');

      // Resolve the save
      const saved: SafeResponseRequest = {
        ...baseAssignedRequest,
        fieldNotes: 'Valid operational update in progress.',
        fieldUpdatedAt: '2026-09-24T10:21:00.000Z'
      };
      pendingSave.resolve(saved);
      // Wait for the visible outcome rather than a fixed number of async steps.
      await vi.waitFor(() => expect(screenText(renderDetails())).toContain('Field update saved successfully.'));
    });
  });

  describe('Duplicate Submission Prevention', () => {
    it('prevents multiple rapid taps from firing duplicate network requests while save is in-flight', async () => {
      const pendingSave = deferred<SafeResponseRequest>();
      vi.mocked(saveResponderFieldUpdate).mockReturnValue(pendingSave.promise);

      const input = getFieldNotesInput();
      input?.onChangeText?.('Checking bridge stability.');

      const saveBtn = getSaveFieldUpdateButton();
      // Rapid multiple presses
      saveBtn?.onPress();
      saveBtn?.onPress();
      saveBtn?.onPress();

      expect(saveResponderFieldUpdate).toHaveBeenCalledTimes(1);

      pendingSave.resolve({
        ...baseAssignedRequest,
        fieldNotes: 'Checking bridge stability.',
        fieldUpdatedAt: '2026-09-24T10:22:00.000Z'
      });
      await Promise.resolve();
    });
  });

  describe('Error Handling and Input Preservation', () => {
    it('preserves typed notes and displays friendly message on network error, allowing retry', async () => {
      vi.mocked(saveResponderFieldUpdate).mockRejectedValueOnce(
        new ApiClientError(0, 'API_ERROR', 'Unable to save field update. Please check your connection and try again.')
      );

      const notesToSave = 'Obstacle encountered on secondary bridge.';
      const input = getFieldNotesInput();
      input?.onChangeText?.(notesToSave);

      const saveBtn = getSaveFieldUpdateButton();
      await saveBtn?.onPress();

      // Error message rendered
      const text = screenText(renderDetails());
      expect(text).toContain('Unable to save field update. Please check your connection and try again.');

      // Input must still contain the user's typed text (NOT wiped out)
      expect(getFieldNotesInput()?.value).toBe(notesToSave);

      // Save button is re-enabled for retry
      const retryBtn = getSaveFieldUpdateButton();
      expect(retryBtn?.disabled).toBe(false);

      // Retry succeeding
      vi.mocked(saveResponderFieldUpdate).mockResolvedValueOnce({
        ...baseAssignedRequest,
        fieldNotes: notesToSave,
        fieldUpdatedAt: '2026-09-24T10:25:00.000Z'
      });
      await retryBtn?.onPress();

      expect(saveResponderFieldUpdate).toHaveBeenCalledTimes(2);
      expect(screenText(renderDetails())).toContain('Field update saved successfully.');
    });

    it('handles 403 REQUEST_NOT_ASSIGNED error and retains typed input', async () => {
      vi.mocked(saveResponderFieldUpdate).mockRejectedValueOnce(
        new ApiClientError(
          403,
          'REQUEST_NOT_ASSIGNED',
          'Only the responder assigned to this request can record field updates.'
        )
      );

      const input = getFieldNotesInput();
      input?.onChangeText?.('Attempting note on unassigned request.');

      await getSaveFieldUpdateButton()?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Only the responder assigned to this request can record field updates.');
      expect(getFieldNotesInput()?.value).toBe('Attempting note on unassigned request.');
    });

    it('handles 409 INVALID_REQUEST_STATUS lifecycle conflict error', async () => {
      vi.mocked(saveResponderFieldUpdate).mockRejectedValueOnce(
        new ApiClientError(
          409,
          'INVALID_REQUEST_STATUS',
          'Field updates cannot be recorded on this request in its current status.'
        )
      );

      const input = getFieldNotesInput();
      input?.onChangeText?.('Note on status changed request.');

      await getSaveFieldUpdateButton()?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Field updates cannot be recorded on this request in its current status.');
    });
  });

  describe('Lifecycle-Aware UI Visibility', () => {
    it.each(['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] as const)(
      'renders the active Field Update section for %s request',
      (status) => {
        updateCachedResponderRequest({ ...baseAssignedRequest, status });
        const text = screenText(renderDetails());
        expect(text).toContain('FIELD UPDATE');
        expect(getFieldNotesInput()).toBeDefined();
        expect(getSaveFieldUpdateButton()).toBeDefined();
      }
    );

    it('does not render editable Field Update section when request status is NEW', () => {
      updateCachedResponderRequest({
        ...baseAssignedRequest,
        status: 'NEW',
        assignedResponderId: undefined
      });

      const text = screenText(renderDetails());
      expect(text).not.toContain('FIELD UPDATE');
      expect(getFieldNotesInput()).toBeUndefined();
      expect(getSaveFieldUpdateButton()).toBeUndefined();
    });

    it('does not render editable Field Update section when request status is CANCELLED', () => {
      updateCachedResponderRequest({
        ...baseAssignedRequest,
        status: 'CANCELLED'
      });

      const text = screenText(renderDetails());
      expect(text).not.toContain('FIELD UPDATE');
      expect(getFieldNotesInput()).toBeUndefined();
      expect(getSaveFieldUpdateButton()).toBeUndefined();
    });

    it('displays read-only SAVED FIELD NOTES without an edit form when status is COMPLETED', () => {
      updateCachedResponderRequest({
        ...baseAssignedRequest,
        status: 'COMPLETED',
        fieldNotes: 'Mission completed with full medical relief.',
        fieldUpdatedAt: '2026-09-24T11:00:00.000Z'
      });

      const text = screenText(renderDetails());
      expect(text).toContain('SAVED FIELD NOTES');
      expect(text).toContain('Mission completed with full medical relief.');
      expect(text).not.toContain('FIELD UPDATE');
      expect(getFieldNotesInput()).toBeUndefined();
      expect(getSaveFieldUpdateButton()).toBeUndefined();
    });

    it('does not render Field Update section if request is assigned to a different responder', () => {
      updateCachedResponderRequest({
        ...baseAssignedRequest,
        assignedResponderId: 'different-responder-id'
      });

      const text = screenText(renderDetails());
      expect(text).not.toContain('FIELD UPDATE');
      expect(getFieldNotesInput()).toBeUndefined();
      expect(getSaveFieldUpdateButton()).toBeUndefined();
    });
  });

  describe('LDFEW-355: Display previously saved responder updates', () => {
    it('fetches and displays previously saved field update and formatted timestamp on mount', async () => {
      const savedTime = '2026-09-24T10:15:00.000Z';
      const savedNotes = 'Previously recorded: primary road flooded, diverted via secondary bypass.';
      const requestWithSavedNotes: SafeResponseRequest = {
        ...baseAssignedRequest,
        fieldNotes: savedNotes,
        fieldUpdatedAt: savedTime
      };

      vi.mocked(getResponderRequestById).mockResolvedValueOnce(requestWithSavedNotes);

      renderDetails();
      lifecycle.focus();
      await Promise.resolve();

      const text = screenText(renderDetails());
      expect(text).toContain('PREVIOUSLY SAVED UPDATE');
      expect(text).toContain(savedNotes);
      expect(text).toContain(new Date(savedTime).toLocaleString());

      const input = getFieldNotesInput();
      expect(input?.value).toBe(savedNotes);
    });

    it('restores previously saved field update when responder leaves the screen and returns', async () => {
      const savedTime = '2026-09-24T10:20:00.000Z';
      const savedNotes = 'Field triage completed; patient stable.';
      const requestWithUpdate: SafeResponseRequest = {
        ...baseAssignedRequest,
        fieldNotes: savedNotes,
        fieldUpdatedAt: savedTime
      };

      // Simulate returning to the screen: unmounting then re-mounting
      lifecycle.slots = [];
      vi.mocked(getResponderRequestById).mockResolvedValue(requestWithUpdate);

      renderDetails();
      // Trigger screen focus (via useFocusEffect)
      lifecycle.focus();
      await Promise.resolve();

      const text = screenText(renderDetails());
      expect(text).toContain('PREVIOUSLY SAVED UPDATE');
      expect(text).toContain(savedNotes);
      expect(text).toContain(new Date(savedTime).toLocaleString());
      expect(getFieldNotesInput()?.value).toBe(savedNotes);
    });

    it('re-queries backend and updates displayed update when tapping Refresh button in header', async () => {
      const initialRequest: SafeResponseRequest = {
        ...baseAssignedRequest,
        fieldNotes: 'Initial observation: rain intensifying.',
        fieldUpdatedAt: '2026-09-24T10:10:00.000Z'
      };
      updateCachedResponderRequest(initialRequest);
      renderDetails();

      expect(screenText(renderDetails())).toContain('Initial observation: rain intensifying.');

      const newerUpdate: SafeResponseRequest = {
        ...baseAssignedRequest,
        fieldNotes: 'Refreshed update: water level receding.',
        fieldUpdatedAt: '2026-09-24T10:40:00.000Z'
      };
      vi.mocked(getResponderRequestById).mockResolvedValueOnce(newerUpdate);

      const buttons = screenButtons(renderDetails());
      const refreshBtn = buttons.find((b) => b.accessibilityLabel === 'Refresh request details');
      expect(refreshBtn).toBeDefined();

      await refreshBtn?.onPress();

      const updatedText = screenText(renderDetails());
      expect(updatedText).toContain('PREVIOUSLY SAVED UPDATE');
      expect(updatedText).toContain('Refreshed update: water level receding.');
      expect(updatedText).toContain(new Date('2026-09-24T10:40:00.000Z').toLocaleString());
      expect(getFieldNotesInput()?.value).toBe('Refreshed update: water level receding.');
    });

    it('renders clean initial state without previously saved update box when request has no field notes', () => {
      const freshRequest: SafeResponseRequest = {
        ...baseAssignedRequest,
        fieldNotes: undefined,
        fieldUpdatedAt: undefined
      };
      updateCachedResponderRequest(freshRequest);

      const text = screenText(renderDetails());
      expect(text).not.toContain('PREVIOUSLY SAVED UPDATE');
      expect(text).toContain('Field Notes *');
      expect(getFieldNotesInput()?.value).toBe('');
    });
  });
});

