import * as React from 'react';
import type {
  CreateResponseRequestResponse,
  SafeResponseRequest,
  SafeUser
} from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../../../services/api/client';
import { createResidentResponseRequest } from '../api/responseRequestApi';
import { validateEmergencyAssistanceDraft, type AccessCondition, type EmergencyAssistanceType } from '../emergencyAssistanceDraft';
import { ReviewEmergencyRequestScreen } from './ReviewEmergencyRequestScreen';
import { EmergencyRequestSubmittedScreen } from './EmergencyRequestSubmittedScreen';

const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effect: (() => undefined) as () => (() => void) | undefined
}));

const navigation = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  canGoBack: vi.fn(() => true)
}));

const authState = vi.hoisted(() => ({
  accessToken: 'valid-resident-token' as string | null,
  user: {
    id: 'resident-1',
    name: 'Anula Bandara',
    email: 'anula@example.com',
    role: 'RESIDENT'
  } as SafeUser | null
}));

const defaultDraft = {
  assistanceType: 'FLOOD_ASSISTANCE' as EmergencyAssistanceType,
  location: {
    status: 'DETECTED' as const,
    latitude: 6.9271,
    longitude: 79.8612,
    accuracyMeters: 10,
    capturedAt: '2026-10-01T10:00:00.000Z',
    errorMessage: null
  },
  affectedPeopleCount: 4,
  medicalNeeds: { requiresMedicalAssistance: true, injuredCount: 1 },
  vulnerablePeople: { children: 1, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
  accessCondition: 'LIMITED' as AccessCondition,
  contactDetails: {
    name: 'Anula Bandara',
    email: 'anula@example.com',
    phoneNumber: '0779998888',
    usesAuthenticatedProfile: true
  },
  emergencyDescription: 'Ground floor submerged by flash flooding.',
  specialRequirements: 'Need clean drinking water.',
  reviewRequestedAt: '2026-10-01T10:01:00.000Z'
};

const draftState = vi.hoisted(() => {
  const initialDraft = {
    assistanceType: 'FLOOD_ASSISTANCE' as EmergencyAssistanceType,
    location: {
      status: 'DETECTED' as const,
      latitude: 6.9271,
      longitude: 79.8612,
      accuracyMeters: 10,
      capturedAt: '2026-10-01T10:00:00.000Z',
      errorMessage: null
    },
    affectedPeopleCount: 4,
    medicalNeeds: { requiresMedicalAssistance: true, injuredCount: 1 },
    vulnerablePeople: { children: 1, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
    accessCondition: 'LIMITED' as AccessCondition,
    contactDetails: {
      name: 'Anula Bandara',
      email: 'anula@example.com',
      phoneNumber: '0779998888',
      usesAuthenticatedProfile: true
    },
    emergencyDescription: 'Ground floor submerged by flash flooding.',
    specialRequirements: 'Need clean drinking water.',
    reviewRequestedAt: '2026-10-01T10:01:00.000Z'
  };

  return {
    draft: initialDraft,
    validation: { isValid: true, errors: {} as Record<string, string> },
    submittedResponseRequest: null as SafeResponseRequest | null,
    setDraft: vi.fn(),
    resetDraft: vi.fn(),
    setSubmittedResponseRequest: vi.fn()
  };
});

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => {
    const index = lifecycle.cursor++;
    lifecycle.slots[index] ??= { current: initial };
    return lifecycle.slots[index];
  },
  useEffect: (callback: typeof lifecycle.effect) => {
    lifecycle.effect = callback;
  },
  useState: (initial: unknown) => {
    const index = lifecycle.cursor++;
    if (!(index in lifecycle.slots)) {
      lifecycle.slots[index] = initial;
    }
    return [
      lifecycle.slots[index],
      (value: unknown) => {
        lifecycle.slots[index] =
          typeof value === 'function'
            ? (value as (prev: unknown) => unknown)(lifecycle.slots[index])
            : value;
      }
    ];
  }
}));

vi.mock('expo-router', () => ({
  useRouter: () => navigation
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => authState
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'span',
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    disabled
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityState?: { disabled?: boolean; busy?: boolean };
    disabled?: boolean;
  }) => {
    const content = typeof children === 'function' ? children({ pressed: false }) : children;
    return (
      <button
        aria-label={accessibilityLabel}
        data-role={accessibilityRole ?? 'button'}
        aria-busy={accessibilityState?.busy}
        disabled={disabled}
        onClick={onPress}
      >
        {content}
      </button>
    );
  },
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TextInput: ({
    value,
    onChangeText,
    onBlur,
    accessibilityLabel,
    placeholder
  }: {
    value?: string;
    onChangeText?: (text: string) => void;
    onBlur?: () => void;
    accessibilityLabel?: string;
    placeholder?: string;
  }) => (
    <input
      aria-label={accessibilityLabel}
      placeholder={placeholder}
      value={value}
      onBlur={onBlur}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  ),
  StyleSheet: { create: (styles: unknown) => styles }
}));

vi.mock('@/services/api/client', async () => import('../../../../services/api/client'));

vi.mock('../api/responseRequestApi', () => ({
  createResidentResponseRequest: vi.fn(),
  listMyResponseRequests: vi.fn(),
  getMyResponseRequestById: vi.fn()
}));

vi.mock('../emergencyAssistanceDraft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../emergencyAssistanceDraft')>();
  return {
    ...actual,
    useEmergencyAssistanceDraft: () => draftState
  };
});

vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => children
}));

vi.mock('../../shared/components/DashboardGlyph', () => ({
  DashboardGlyph: () => null
}));

vi.mock('../../shared/currentLocation', () => ({
  captureCurrentLocation: vi.fn(async () => ({
    status: 'DETECTED',
    latitude: 6.9271,
    longitude: 79.8612,
    accuracyMeters: 12,
    capturedAt: '2026-10-01T10:00:00.000Z',
    errorMessage: null
  })),
  formatCoordinate: (val: number | null | undefined) =>
    val !== null && val !== undefined ? String(val) : 'Not provided'
}));

const mockCreatedResponse: CreateResponseRequestResponse = {
  responseRequest: {
    id: '507f1f77bcf86cd799439099',
    residentId: 'resident-1',
    status: 'NEW',
    assistanceType: 'FLOOD_ASSISTANCE',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    affectedPeople: 4,
    medicalNeeds: true,
    injuredPeople: 1,
    vulnerablePeople: { children: 1, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'LIMITED',
    contact: { name: 'Anula Bandara', phoneNumber: '0779998888', email: 'anula@example.com' },
    description: 'Ground floor submerged by flash flooding.',
    specialRequirements: 'Need clean drinking water.',
    createdAt: '2026-10-01T10:05:00.000Z',
    updatedAt: '2026-10-01T10:05:00.000Z'
  }
};

type ButtonProps = {
  accessibilityLabel?: string;
  'aria-label'?: string;
  accessibilityRole?: string;
  'data-role'?: string;
  accessibilityState?: { disabled?: boolean; busy?: boolean };
  disabled?: boolean;
  onPress?: () => void;
  onClick?: () => void;
  children?: React.ReactNode;
};

function screenButtons(node: React.ReactNode): ButtonProps[] {
  if (Array.isArray(node)) return node.flatMap(screenButtons);
  if (!React.isValidElement<ButtonProps>(node)) return [];
  if (typeof node.type === 'function') {
    return screenButtons((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  const childButtons = screenButtons(node.props.children);
  const isButton =
    node.type === 'button' ||
    node.props.accessibilityRole === 'button' ||
    node.props['data-role'] === 'button';
  if (isButton) {
    const resolvedProps: ButtonProps = {
      ...node.props,
      accessibilityLabel: node.props.accessibilityLabel ?? node.props['aria-label'],
      onPress: node.props.onPress ?? node.props.onClick
    };
    return [resolvedProps, ...childButtons];
  }
  return childButtons;
}

function screenText(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(screenText).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement<{ children?: React.ReactNode; value?: unknown }>(node)) return '';
  if (typeof node.type === 'function') {
    return screenText((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  const childText = screenText(node.props.children);
  const valueText = typeof node.props.value === 'string' ? node.props.value : '';
  return [childText, valueText].filter(Boolean).join(' ');
}

describe('LDFEW-383: Resident Emergency Request Creation Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    navigation.canGoBack.mockReturnValue(true);
    authState.accessToken = 'valid-resident-token';
    authState.user = {
      id: 'resident-1',
      name: 'Anula Bandara',
      email: 'anula@example.com',
      role: 'RESIDENT'
    };
    draftState.draft = defaultDraft;
    draftState.validation = { isValid: true, errors: {} };
    draftState.submittedResponseRequest = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Emergency Assistance Request Review and Submission', () => {
    it.each(['', '077123456', '07712345678', '077ABC4567', '077-1234567', '077 1234567'])(
      'blocks final create submission for raw invalid phone %j even if the input was bypassed', async (phoneNumber) => {
        draftState.draft = { ...defaultDraft, contactDetails: { ...defaultDraft.contactDetails, phoneNumber } };
        draftState.validation = validateEmergencyAssistanceDraft(draftState.draft);
        lifecycle.cursor = 0;
        const submit = screenButtons(ReviewEmergencyRequestScreen()).find((button) => button.accessibilityLabel === 'Submit emergency request');
        expect(submit?.disabled).toBe(true);
        await submit?.onPress?.();
        expect(createResidentResponseRequest).not.toHaveBeenCalled();
        expect(navigation.replace).not.toHaveBeenCalled();
      }
    );
    it('renders all review details from the draft accurately', () => {
      lifecycle.cursor = 0;
      const screen = ReviewEmergencyRequestScreen();
      const markup = screenText(screen);

      expect(markup).toContain('Review Emergency Request');
      expect(markup).toContain('Flood Assistance');
      expect(markup).toContain('6.9271');
      expect(markup).toContain('79.8612');
      expect(markup).toContain('Affected people');
      expect(markup).toContain('4');
      expect(markup).toContain('Injured people');
      expect(markup).toContain('1');
      expect(markup).toContain('Children');
      expect(markup).toContain('Elderly people');
      expect(markup).toContain('Limited');
      expect(markup).toContain('Anula Bandara');
      expect(markup).toContain('0779998888');
      expect(markup).toContain('Ground floor submerged by flash flooding.');
      expect(markup).toContain('Need clean drinking water.');
    });

    it('navigates back to the form when "Edit Request" is pressed', () => {
      lifecycle.cursor = 0;
      const screen = ReviewEmergencyRequestScreen();
      const buttons = screenButtons(screen);

      const editBtn = buttons.find((b) => b.accessibilityLabel === 'Edit emergency request');
      expect(editBtn).toBeDefined();

      editBtn?.onPress?.();
      expect(navigation.push).toHaveBeenCalledWith('/resident/help');
    });

    it('submits valid request and navigates to submitted confirmation on success', async () => {
      vi.mocked(createResidentResponseRequest).mockResolvedValueOnce(mockCreatedResponse);

      lifecycle.cursor = 0;
      const screen = ReviewEmergencyRequestScreen();
      const buttons = screenButtons(screen);
      const submitBtn = buttons.find((b) => b.accessibilityLabel === 'Submit emergency request');
      expect(submitBtn).toBeDefined();
      expect(submitBtn?.disabled).toBe(false);

      const submitAction = submitBtn?.onPress;
      await submitAction?.();

      expect(createResidentResponseRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          assistanceType: 'FLOOD_ASSISTANCE',
          location: { type: 'Point', coordinates: [79.8612, 6.9271] },
          affectedPeople: 4,
          description: 'Ground floor submerged by flash flooding.',
          contact: expect.objectContaining({
            name: 'Anula Bandara',
            phoneNumber: '0779998888'
          })
        }),
        'valid-resident-token'
      );

      expect(navigation.replace).toHaveBeenCalledWith('/resident/emergency-request-submitted');
    });

    it('prevents duplicate submissions on rapid multiple taps', async () => {
      let resolveSubmission!: (val: CreateResponseRequestResponse) => void;
      const pendingPromise = new Promise<CreateResponseRequestResponse>((resolve) => {
        resolveSubmission = resolve;
      });

      vi.mocked(createResidentResponseRequest).mockReturnValueOnce(pendingPromise);

      lifecycle.cursor = 0;
      const screen = ReviewEmergencyRequestScreen();
      const buttons = screenButtons(screen);
      const submitBtn = buttons.find((b) => b.accessibilityLabel === 'Submit emergency request');
      expect(submitBtn).toBeDefined();

      // Fire first tap (starts async in-flight dispatch)
      const firstTap = submitBtn?.onPress?.();
      // Fire second tap immediately while first is in flight
      const secondTap = submitBtn?.onPress?.();

      expect(createResidentResponseRequest).toHaveBeenCalledTimes(1);

      // Resolve the network call
      resolveSubmission(mockCreatedResponse);
      await firstTap;
      await secondTap;

      expect(createResidentResponseRequest).toHaveBeenCalledTimes(1);
    });

    it('displays network failure message with retry button and preserves draft data', async () => {
      const networkError = new ApiClientError(0, 'Cannot reach server', 'NETWORK_ERROR');
      vi.mocked(createResidentResponseRequest).mockRejectedValueOnce(networkError);

      lifecycle.cursor = 0;
      const screen = ReviewEmergencyRequestScreen();
      const submitBtn = screenButtons(screen).find(
        (b) => b.accessibilityLabel === 'Submit emergency request'
      );

      await submitBtn?.onPress?.();

      // Re-render screen to capture updated submitState
      lifecycle.cursor = 0;
      const updatedScreen = ReviewEmergencyRequestScreen();
      const text = screenText(updatedScreen);

      expect(text).toContain('Cannot reach SafeAlert right now');
      expect(text).toContain('Your current location, people information');

      // Retry button is available
      const retryBtn = screenButtons(updatedScreen).find(
        (b) => b.accessibilityLabel === 'Retry emergency request submission'
      );
      expect(retryBtn).toBeDefined();
    });
  });

  describe('Emergency Request Submitted Confirmation Screen', () => {
    it('displays confirmed details from submitted request', () => {
      draftState.submittedResponseRequest = mockCreatedResponse.responseRequest;

      lifecycle.cursor = 0;
      const screen = EmergencyRequestSubmittedScreen();
      const markup = screenText(screen);

      expect(markup).toContain('Request Submitted');
      expect(markup).toContain('Emergency Request Submitted Successfully!');
      expect(markup).toContain('NEW');
      expect(markup).toContain('507f1f77bcf86cd799439099');
      expect(markup).toContain('Flood Assistance');
      expect(markup).toContain('Limited');
      expect(markup).toContain('6.927100, 79.861200');
    });

    it('navigates to "My Emergency Requests" when "Track Request" is pressed', () => {
      draftState.submittedResponseRequest = mockCreatedResponse.responseRequest;

      lifecycle.cursor = 0;
      const screen = EmergencyRequestSubmittedScreen();
      const buttons = screenButtons(screen);

      const trackBtn = buttons.find((b) => b.accessibilityLabel === 'Track emergency request');
      expect(trackBtn).toBeDefined();

      trackBtn?.onPress?.();
      expect(navigation.push).toHaveBeenCalledWith('/resident/my-emergency-requests');
    });

    it('navigates to Resident home when "Back to Home" is pressed', () => {
      draftState.submittedResponseRequest = mockCreatedResponse.responseRequest;

      lifecycle.cursor = 0;
      const screen = EmergencyRequestSubmittedScreen();
      const buttons = screenButtons(screen);

      const homeBtn = buttons.find((b) => b.accessibilityLabel === 'Return to resident dashboard');
      expect(homeBtn).toBeDefined();

      homeBtn?.onPress?.();
      expect(navigation.push).toHaveBeenCalledWith('/resident');
    });
  });
});
