import * as React from 'react';
import type { SafeResponseRequest, SafeUser } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponderRequestDetailsScreen } from './ResponderRequestDetailsScreen';
import { updateResponderRequestProgress } from '../api/responderProgressApi';
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

vi.mock('../api/responderProgressApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/responderProgressApi')>(),
  updateResponderRequestProgress: vi.fn()
}));

vi.mock('../api/responderFieldUpdateApi', () => ({
  saveResponderFieldUpdate: vi.fn()
}));

vi.mock('../api/responderRequestsApi', () => ({
  listAssignedResponderRequests: vi.fn(),
  listPendingResponderRequests: vi.fn()
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

const baseInProgressRequest: SafeResponseRequest = {
  id: mockRequestId,
  residentId: 'resident-1',
  assignedResponderId: 'responder-1',
  status: 'IN_PROGRESS',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 2,
  injuredPeople: 1,
  medicalNeeds: true,
  vulnerablePeople: { children: 0, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'ACCESSIBLE',
  contact: { name: 'Resident User', phoneNumber: '+94-77-555-1234' },
  description: 'Resident requires medical triage.',
  acceptedAt: '2026-09-24T10:00:00.000Z',
  dispatchedAt: '2026-09-24T10:05:00.000Z',
  arrivedAt: '2026-09-24T10:15:00.000Z',
  inProgressAt: '2026-09-24T10:20:00.000Z',
  createdAt: '2026-09-24T09:55:00.000Z',
  updatedAt: '2026-09-24T10:20:00.000Z'
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

function getAssistanceInput() {
  const inputs = screenInputs(renderDetails());
  return inputs.find((i) => i.accessibilityLabel === 'Assistance Provided');
}

function getSummaryInput() {
  const inputs = screenInputs(renderDetails());
  return inputs.find((i) => i.accessibilityLabel === 'Completion Summary');
}

function getRemarksInput() {
  const inputs = screenInputs(renderDetails());
  return inputs.find((i) => i.accessibilityLabel === 'Responder Remarks');
}

function getCompleteRequestButton() {
  const buttons = screenButtons(renderDetails());
  return buttons.find((b) => b.accessibilityLabel === 'Complete Request');
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
  updateCachedResponderRequest(baseInProgressRequest);
});

afterEach(() => {
  clearResponderRequestCache();
  vi.unstubAllGlobals();
});

describe('LDFEW-352: Mobile-Friendly Completion Details Form in Responder Request Details', () => {
  describe('Form Rendering and Initial Layout', () => {
    it('renders the RECORD COMPLETION DETAILS section when status is IN_PROGRESS', () => {
      const rendered = renderDetails();
      const text = screenText(rendered);

      expect(text).toContain('RECORD COMPLETION DETAILS');
      expect(text).toContain('Document the assistance provided and resolution outcome before completing this request.');

      const assistance = getAssistanceInput();
      expect(assistance).toBeDefined();
      expect(assistance?.placeholder).toBe('e.g., Relocated resident to shelter and provided first aid');
      expect(assistance?.maxLength).toBe(1000);

      const summary = getSummaryInput();
      expect(summary).toBeDefined();
      expect(summary?.placeholder).toBe('e.g., Immediate threat resolved; resident safe and stable');
      expect(summary?.maxLength).toBe(1000);

      const remarks = getRemarksInput();
      expect(remarks).toBeDefined();
      expect(remarks?.placeholder).toBe('Optional operational or handover remarks...');
      expect(remarks?.maxLength).toBe(1000);

      const completeBtn = getCompleteRequestButton();
      expect(completeBtn).toBeDefined();
    });

    it('pre-fills existing completion details if already present on the request record', () => {
      const requestWithDetails: SafeResponseRequest = {
        ...baseInProgressRequest,
        assistanceProvided: 'Pre-existing emergency care provided.',
        completionSummary: 'Pre-existing summary outcome.'
      };
      updateCachedResponderRequest(requestWithDetails);

      expect(getAssistanceInput()?.value).toBe('Pre-existing emergency care provided.');
      expect(getSummaryInput()?.value).toBe('Pre-existing summary outcome.');
      expect(getRemarksInput()?.value).toBe('');
    });
  });

  describe('Client-Side Validation and Inline Error Feedback', () => {
    it('requires Assistance Provided and displays inline error when left empty', async () => {
      const assistance = getAssistanceInput();
      assistance?.onChangeText?.('');
      const summary = getSummaryInput();
      summary?.onChangeText?.('Resident handed over to emergency medical team.');

      const completeBtn = getCompleteRequestButton();
      await completeBtn?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Assistance provided is required.');
      expect(updateResponderRequestProgress).not.toHaveBeenCalled();
    });

    it('requires Completion Summary and displays inline error when left empty', async () => {
      const assistance = getAssistanceInput();
      assistance?.onChangeText?.('Administered oxygen and treated wound.');
      const summary = getSummaryInput();
      summary?.onChangeText?.('');

      const completeBtn = getCompleteRequestButton();
      await completeBtn?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Completion summary is required.');
      expect(updateResponderRequestProgress).not.toHaveBeenCalled();
    });

    it('rejects whitespace-only values for required fields', async () => {
      const assistance = getAssistanceInput();
      assistance?.onChangeText?.('     ');
      const summary = getSummaryInput();
      summary?.onChangeText?.('   \t\n  ');

      const completeBtn = getCompleteRequestButton();
      await completeBtn?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Assistance provided is required.');
      expect(updateResponderRequestProgress).not.toHaveBeenCalled();
    });

    it('enforces minimum length of 3 characters for required fields', async () => {
      const assistance = getAssistanceInput();
      assistance?.onChangeText?.('ab');
      const summary = getSummaryInput();
      summary?.onChangeText?.('Immediate threat resolved.');

      const completeBtn = getCompleteRequestButton();
      await completeBtn?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Assistance provided must be at least 3 characters.');
      expect(updateResponderRequestProgress).not.toHaveBeenCalled();
    });

    it('prevents submission and displays inline errors when attempting to complete with empty fields entered', async () => {
      getAssistanceInput()?.onChangeText?.('');
      getSummaryInput()?.onChangeText?.('');

      const completeBtn = getCompleteRequestButton();
      await completeBtn?.onPress();

      const text = screenText(renderDetails());
      expect(text).toContain('Assistance provided is required.');
      expect(text).toContain('Completion summary is required.');
      expect(updateResponderRequestProgress).not.toHaveBeenCalled();
    });

    it('clears field-level error dynamically when the responder types into that input', async () => {
      // Trigger validation error on Assistance Provided
      getAssistanceInput()?.onChangeText?.('');
      getSummaryInput()?.onChangeText?.('Valid outcome summary.');
      getCompleteRequestButton()?.onPress();

      expect(screenText(renderDetails())).toContain('Assistance provided is required.');

      // Start typing to correct the field
      getAssistanceInput()?.onChangeText?.('A');

      // The field error should be cleared immediately upon editing
      expect(screenText(renderDetails())).not.toContain('Assistance provided is required.');
    });

    it('clears completion summary error dynamically when the responder types into summary input', async () => {
      getAssistanceInput()?.onChangeText?.('Valid assistance provided.');
      getSummaryInput()?.onChangeText?.('');
      getCompleteRequestButton()?.onPress();

      expect(screenText(renderDetails())).toContain('Completion summary is required.');

      getSummaryInput()?.onChangeText?.('Patient is stable.');

      expect(screenText(renderDetails())).not.toContain('Completion summary is required.');
    });
  });

  describe('Integration with Complete Request Workflow', () => {
    it('submits valid completion details along with the COMPLETED transition', async () => {
      const completedResponse: SafeResponseRequest = {
        ...baseInProgressRequest,
        status: 'COMPLETED',
        assistanceProvided: 'Relocated resident to shelter and provided first aid.',
        completionSummary: 'Immediate threat resolved; resident safe and stable.',
        responderRemarks: 'Handed over to shelter coordinator.',
        completedAt: '2026-09-24T10:30:00.000Z',
        updatedAt: '2026-09-24T10:30:00.000Z'
      };
      vi.mocked(updateResponderRequestProgress).mockResolvedValueOnce(completedResponse);

      getAssistanceInput()?.onChangeText?.('  Relocated resident to shelter and provided first aid.  ');
      getSummaryInput()?.onChangeText?.('  Immediate threat resolved; resident safe and stable.  ');
      getRemarksInput()?.onChangeText?.('  Handed over to shelter coordinator.  ');

      await getCompleteRequestButton()?.onPress();

      // Verify that updateResponderRequestProgress receives trimmed completion details
      expect(updateResponderRequestProgress).toHaveBeenCalledTimes(1);
      expect(updateResponderRequestProgress).toHaveBeenCalledWith(
        mockRequestId,
        'COMPLETED',
        'valid-responder-token',
        {
          assistanceProvided: 'Relocated resident to shelter and provided first aid.',
          completionSummary: 'Immediate threat resolved; resident safe and stable.',
          responderRemarks: 'Handed over to shelter coordinator.'
        }
      );

      // Verify that cache and screen state were updated to COMPLETED
      expect(getCachedResponderRequest(mockRequestId)?.status).toBe('COMPLETED');
      expect(getCachedResponderRequest(mockRequestId)?.assistanceProvided).toBe(
        'Relocated resident to shelter and provided first aid.'
      );
      expect(screenText(renderDetails())).toContain('Emergency response completed');
    });

    it('allows optional Responder Remarks to be omitted when completing', async () => {
      const completedResponse: SafeResponseRequest = {
        ...baseInProgressRequest,
        status: 'COMPLETED',
        assistanceProvided: 'Evacuated residents safely to designated shelter.',
        completionSummary: 'Resident safe and stable.',
        completedAt: '2026-09-24T10:30:00.000Z'
      };
      vi.mocked(updateResponderRequestProgress).mockResolvedValueOnce(completedResponse);

      getAssistanceInput()?.onChangeText?.('Evacuated residents safely to designated shelter.');
      getSummaryInput()?.onChangeText?.('Resident safe and stable.');
      // remarks left empty

      await getCompleteRequestButton()?.onPress();

      expect(updateResponderRequestProgress).toHaveBeenCalledWith(
        mockRequestId,
        'COMPLETED',
        'valid-responder-token',
        {
          assistanceProvided: 'Evacuated residents safely to designated shelter.',
          completionSummary: 'Resident safe and stable.'
        }
      );
    });

    it('shows loading indicator and disables the complete button during submission', async () => {
      const pendingCompletion = deferred<SafeResponseRequest>();
      vi.mocked(updateResponderRequestProgress).mockReturnValueOnce(pendingCompletion.promise);

      getAssistanceInput()?.onChangeText?.('Evacuated residents safely.');
      getSummaryInput()?.onChangeText?.('Threat resolved.');

      void getCompleteRequestButton()?.onPress();

      // Verify button disabled and busy during flight
      const loadingBtn = getCompleteRequestButton();
      expect(loadingBtn?.disabled).toBe(true);
      expect(loadingBtn?.accessibilityState?.busy).toBe(true);
      expect(screenText(loadingBtn?.children)).toContain('Updating progress...');

      // Inputs should also be non-editable during submission
      expect(getAssistanceInput()?.editable).toBe(false);
      expect(getSummaryInput()?.editable).toBe(false);

      pendingCompletion.resolve({
        ...baseInProgressRequest,
        status: 'COMPLETED',
        assistanceProvided: 'Evacuated residents safely.',
        completionSummary: 'Threat resolved.',
        completedAt: '2026-09-24T10:35:00.000Z'
      });
      await Promise.resolve();

      expect(screenText(renderDetails())).toContain('Emergency response completed');
    });

    it('prevents multiple rapid taps from firing duplicate completion requests', async () => {
      const pendingCompletion = deferred<SafeResponseRequest>();
      vi.mocked(updateResponderRequestProgress).mockReturnValue(pendingCompletion.promise);

      getAssistanceInput()?.onChangeText?.('Treated and transported.');
      getSummaryInput()?.onChangeText?.('Handed to hospital staff.');

      const completeBtn = getCompleteRequestButton();
      completeBtn?.onPress();
      completeBtn?.onPress();
      completeBtn?.onPress();

      expect(updateResponderRequestProgress).toHaveBeenCalledTimes(1);

      pendingCompletion.resolve({
        ...baseInProgressRequest,
        status: 'COMPLETED',
        assistanceProvided: 'Treated and transported.',
        completionSummary: 'Handed to hospital staff.',
        completedAt: '2026-09-24T10:35:00.000Z'
      });
      await Promise.resolve();
    });
  });

  describe('Error Handling and Input Retention', () => {
    it('preserves entered form data on API error, displays friendly message, and allows retry', async () => {
      vi.mocked(updateResponderRequestProgress).mockRejectedValueOnce(
        new ApiClientError(0, 'API_ERROR', 'Unable to confirm request progress. Refresh the request before trying again.')
      );

      const enteredAssistance = 'Delivered critical medicines and warm food.';
      const enteredSummary = 'Resident vitals normal and secure in dry zone.';
      const enteredRemarks = 'Follow-up visit advised in 12 hours.';

      getAssistanceInput()?.onChangeText?.(enteredAssistance);
      getSummaryInput()?.onChangeText?.(enteredSummary);
      getRemarksInput()?.onChangeText?.(enteredRemarks);

      await getCompleteRequestButton()?.onPress();

      // Ensure request status remains IN_PROGRESS and NOT prematurely COMPLETED
      expect(screenText(renderDetails())).toMatch(/Current status:\s+In progress/i);
      expect(screenText(renderDetails())).toContain('Unable to confirm progress');

      // Verify that all entered text is preserved in the inputs
      expect(getAssistanceInput()?.value).toBe(enteredAssistance);
      expect(getSummaryInput()?.value).toBe(enteredSummary);
      expect(getRemarksInput()?.value).toBe(enteredRemarks);

      // Verify retry succeeds with preserved data
      const retryBtn = getCompleteRequestButton();
      expect(retryBtn?.disabled).toBe(false);

      vi.mocked(updateResponderRequestProgress).mockResolvedValueOnce({
        ...baseInProgressRequest,
        status: 'COMPLETED',
        assistanceProvided: enteredAssistance,
        completionSummary: enteredSummary,
        responderRemarks: enteredRemarks,
        completedAt: '2026-09-24T10:40:00.000Z'
      });

      await retryBtn?.onPress();

      expect(updateResponderRequestProgress).toHaveBeenCalledTimes(2);
      expect(screenText(renderDetails())).toContain('Emergency response completed');
    });
  });

  describe('Lifecycle-Aware Form Visibility and Read-Only Completion Details', () => {
    it('does not render the completion form when status is ASSIGNED, DISPATCHED, or ARRIVED', () => {
      for (const status of ['ASSIGNED', 'DISPATCHED', 'ARRIVED'] as const) {
        updateCachedResponderRequest({ ...baseInProgressRequest, status });
        const text = screenText(renderDetails());

        expect(text).not.toContain('RECORD COMPLETION DETAILS');
        expect(getAssistanceInput()).toBeUndefined();
        expect(getSummaryInput()).toBeUndefined();
      }
    });

    it('renders read-only COMPLETION DETAILS card and hides the edit form when status is COMPLETED', () => {
      const completedRequest: SafeResponseRequest = {
        ...baseInProgressRequest,
        status: 'COMPLETED',
        assistanceProvided: 'Relocated resident safely to shelter.',
        completionSummary: 'Resident safe and stable.',
        responderRemarks: 'Internal handover complete.',
        completedAt: '2026-09-24T11:00:00.000Z'
      };
      updateCachedResponderRequest(completedRequest);

      const text = screenText(renderDetails());

      // The editable form must NOT be present
      expect(text).not.toContain('RECORD COMPLETION DETAILS');
      expect(getAssistanceInput()).toBeUndefined();
      expect(getSummaryInput()).toBeUndefined();

      // Read-only completion details block must be displayed with formatted server completedAt timestamp
      expect(text).toContain('COMPLETION DETAILS');
      expect(text).toContain('Completed at');
      expect(text).toContain(new Date('2026-09-24T11:00:00.000Z').toLocaleString());
      expect(text).toContain('Relocated resident safely to shelter.');
      expect(text).toContain('Resident safe and stable.');
      expect(text).toContain('Internal handover complete.');
    });

    it('renders "Not available" when completedAt timestamp is missing on completed request', () => {
      const completedWithoutTime: SafeResponseRequest = {
        ...baseInProgressRequest,
        status: 'COMPLETED',
        assistanceProvided: 'First aid rendered.',
        completionSummary: 'Resident safe.',
        completedAt: undefined
      };
      updateCachedResponderRequest(completedWithoutTime);

      const text = screenText(renderDetails());
      expect(text).toContain('Completed at');
      expect(text).toContain('Not available');
    });

    it('preserves existing Field Update section alongside completion details form during IN_PROGRESS', () => {
      const text = screenText(renderDetails());

      // Both sections must coexist during IN_PROGRESS
      expect(text).toContain('RECORD COMPLETION DETAILS');
      expect(text).toContain('FIELD UPDATE');
      expect(screenButtons(renderDetails()).some((b) => b.accessibilityLabel === 'Save Field Update')).toBe(true);
      expect(screenButtons(renderDetails()).some((b) => b.accessibilityLabel === 'Complete Request')).toBe(true);
    });
  });
});
