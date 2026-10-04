import * as React from 'react';
import { Alert, Linking, Platform } from 'react-native';
import type { SafeResponseRequest, SafeUser } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponderRequestDetailsScreen } from './ResponderRequestDetailsScreen';
import { getResponderRequestById } from '../api/responderRequestsApi';
import {
  clearResponderRequestCache,
  updateCachedResponderRequest
} from '../requestDetailsCache';
import * as contactLocationUi from '../contactLocationUi';

// Simulated React lifecycle and navigation mocks
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
  Platform: { OS: 'ios' },
  Linking: {
    canOpenURL: vi.fn(),
    openURL: vi.fn()
  }
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => lifecycle.auth
}));

vi.mock('@/services/api/client', async () => import('../../../../services/api/client'));

vi.mock('../api/responderRequestsApi', () => ({
  listAssignedResponderRequests: vi.fn(),
  listPendingResponderRequests: vi.fn(),
  getResponderRequestById: vi.fn()
}));

vi.mock('../api/responderDecisionApi', () => ({
  acceptResponderRequest: vi.fn(),
  declineResponderRequest: vi.fn()
}));

vi.mock('../api/responderProgressApi', () => ({
  updateResponderRequestProgress: vi.fn()
}));

vi.mock('../api/responderFieldUpdateApi', () => ({
  saveResponderFieldUpdate: vi.fn()
}));

vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => children
}));

vi.mock('../../shared/components/DashboardGlyph', () => ({
  DashboardGlyph: () => null
}));

const mockRequestId = '507f1f77bcf86cd799439011';

const sampleAssignedRequest: SafeResponseRequest = {
  id: mockRequestId,
  residentId: 'resident-1',
  assignedResponderId: 'responder-1',
  status: 'ASSIGNED',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.86124, 6.927079] },
  affectedPeople: 2,
  injuredPeople: 1,
  medicalNeeds: true,
  vulnerablePeople: { children: 0, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'ACCESSIBLE',
  contact: { name: 'Sunil Perera', phoneNumber: '+94 77 123 4567', email: 'sunil@example.com' },
  description: 'Water entering the house, elderly resident requires assistance.',
  createdAt: '2026-09-30T10:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z'
};

const samplePendingRequest: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439099',
  residentId: 'resident-2',
  status: 'NEW',
  assistanceType: 'RESCUE_EVACUATION',
  location: { type: 'Point', coordinates: [80.217, 7.2906] },
  affectedPeople: 4,
  injuredPeople: 0,
  medicalNeeds: false,
  vulnerablePeople: { children: 2, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 1 },
  roadAccessibility: 'LIMITED',
  contact: { name: 'Kamala Silva', phoneNumber: '+94-71-987-6543' },
  description: 'Trapped on upper floor due to sudden rise in flood waters.',
  createdAt: '2026-09-30T11:00:00.000Z',
  updatedAt: '2026-09-30T11:00:00.000Z'
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

describe('ResponderRequestDetailsScreen - Contact and Location (LDFEW-267)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Platform.OS = 'ios';
    vi.mocked(Linking.openURL).mockResolvedValue(undefined);
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockRequestId };
    clearResponderRequestCache();
    updateCachedResponderRequest(sampleAssignedRequest);
    vi.mocked(getResponderRequestById).mockResolvedValue(sampleAssignedRequest);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('LDFEW-367/368/369: external actions and unavailable feedback', () => {
    function button(label: string) {
      const result = screenButtons(renderDetails()).find(item => item.accessibilityLabel === label);
      if (!result) throw new Error(`Missing button: ${label}`);
      return result;
    }

    it.each([samplePendingRequest, sampleAssignedRequest])('opens saved contact/location for $status requests', async request => {
      lifecycle.params = { requestId: request.id };
      updateCachedResponderRequest(request);
      button('Call Resident').onPress();
      await vi.waitFor(() => expect(button('Call Resident').accessibilityState?.busy).toBe(false));
      expect(Linking.openURL).toHaveBeenNthCalledWith(1, contactLocationUi.formatTelUrl(request.contact.phoneNumber));
      button('View Location / Route').onPress();
      await vi.waitFor(() => expect(button('View Location / Route').accessibilityState?.busy).toBe(false));
      const [longitude, latitude] = request.location.coordinates;
      expect(Linking.openURL).toHaveBeenNthCalledWith(2,
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}`);
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it.each([undefined, null, '', ' ', 'undefined', 'null', 'NaN', {}, 'call1234567'])('shows unavailable phone for %j', phone => {
      const request = structuredClone(sampleAssignedRequest);
      // Simulate malformed transport data without asserting it is a valid phone.
      Reflect.set(request.contact, 'phoneNumber', phone);
      updateCachedResponderRequest(request);
      const text = screenText(renderDetails());
      expect(text).toContain('Phone number unavailable');
      expect(text).not.toMatch(/undefined|null|NaN|\[object Object\]/);
      expect(button('Call Resident').disabled).toBe(true);
      button('Call Resident').onPress();
      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('handles an entirely missing contact object', () => {
      const request = structuredClone(sampleAssignedRequest);
      Reflect.deleteProperty(request, 'contact');
      updateCachedResponderRequest(request);
      expect(screenText(renderDetails())).toContain('Phone number unavailable');
      expect(button('Call Resident').disabled).toBe(true);
    });

    it.each([
      undefined, null, {}, { type: 'Point' }, { type: 'Point', coordinates: [79] },
      { type: 'Point', coordinates: [undefined, 6] }, { type: 'Point', coordinates: [79, '6'] },
      { type: 'Point', coordinates: [NaN, 6] }, { type: 'Point', coordinates: [79, Infinity] },
      { type: 'Point', coordinates: [181, 6] }, { type: 'Point', coordinates: [79, -91] }
    ])('shows unavailable location for %j', location => {
      const request = structuredClone(sampleAssignedRequest);
      Reflect.set(request, 'location', location);
      updateCachedResponderRequest(request);
      const text = screenText(renderDetails());
      expect(text).toContain('Emergency location unavailable');
      expect(text).not.toMatch(/undefined|null|NaN|Infinity|\[object Object\]/);
      expect(button('View Location / Route').disabled).toBe(true);
      button('View Location / Route').onPress();
      expect(Linking.openURL).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith('Emergency location unavailable', 'Refresh the request details and try again.');
    });

    it.each([
      ['Call Resident', 'Unable to make call', 'The phone application could not be opened. Please try again.'],
      ['View Location / Route', 'Unable to open location', 'The map or browser could not be opened. Please try again.']
    ])('shows safe feedback when %s has no handler or rejects', async (label, title, message) => {
      vi.mocked(Linking.openURL).mockRejectedValue(new Error('No Activity found: private platform diagnostic'));
      button(label).onPress();
      await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(title, message));
      expect(button(label).disabled).toBe(false);
      expect(JSON.stringify(vi.mocked(Alert.alert).mock.calls)).not.toContain('private platform diagnostic');
    });

    it.each(['Call Resident', 'View Location / Route'])('prevents rapid duplicate %s launches and releases the guard', async label => {
      let finish: (() => void) | undefined;
      vi.mocked(Linking.openURL).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
      const action = button(label);
      action.onPress();
      action.onPress();
      expect(Linking.openURL).toHaveBeenCalledTimes(1);
      expect(button(label).accessibilityState?.busy).toBe(true);
      expect(button('Call Resident').disabled).toBe(true);
      expect(button('View Location / Route').disabled).toBe(true);
      finish?.();
      await vi.waitFor(() => expect(button(label).disabled).toBe(false));
      button(label).onPress();
      await vi.waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(2));
    });

    it.each(['Call Resident', 'View Location / Route'])('rechecks data before a stale %s handler executes', label => {
      const oldButton = button(label);
      const request = structuredClone(sampleAssignedRequest);
      request.contact.phoneNumber = '';
      Reflect.deleteProperty(request, 'location');
      updateCachedResponderRequest(request);
      renderDetails();
      oldButton.onPress();
      expect(Linking.openURL).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalled();
    });

    it('does not launch a previous request after navigation changes', () => {
      const oldButton = button('Call Resident');
      lifecycle.params = { requestId: samplePendingRequest.id };
      updateCachedResponderRequest(samplePendingRequest);
      renderDetails();
      oldButton.onPress();
      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('shows generic feedback for an unexpected action failure', async () => {
      vi.spyOn(contactLocationUi, 'initiateResidentCall').mockRejectedValue(new Error('unexpected'));
      button('Call Resident').onPress();
      await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Something went wrong', 'Please try again.'));
    });

    it('uses browser feedback when a map popup is blocked on localhost/web', async () => {
      Platform.OS = 'web';
      const alert = vi.fn();
      vi.stubGlobal('alert', alert);
      vi.stubGlobal('window', { open: vi.fn().mockReturnValue(null) });
      button('View Location / Route').onPress();
      await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(
        'Unable to open location\nThe map or browser could not be opened. Please try again.'));
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('uses browser feedback when the telephone handoff rejects', async () => {
      Platform.OS = 'web';
      const alert = vi.fn();
      vi.stubGlobal('alert', alert);
      vi.mocked(Linking.openURL).mockRejectedValue(new Error('No handler'));
      button('Call Resident').onPress();
      await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(
        'Unable to make call\nThe phone application could not be opened. Please try again.'));
    });
  });

  describe('LDFEW-360: Display Resident Contact Information Clearly', () => {
    it('displays the resident contact information from the selected assigned request', () => {
      const text = screenText(renderDetails());

      expect(text).toContain('RESIDENT CONTACT');
      expect(text).toContain('Resident name');
      expect(text).toContain('Sunil Perera');
      expect(text).toContain('Phone');
      expect(text).toContain('+94 77 123 4567');
      expect(text).toContain('Email');
      expect(text).toContain('sunil@example.com');
    });

    it('displays the resident contact information for a pending (NEW) request', () => {
      lifecycle.params = { requestId: samplePendingRequest.id };
      updateCachedResponderRequest(samplePendingRequest);
      vi.mocked(getResponderRequestById).mockResolvedValue(samplePendingRequest);

      const text = screenText(renderDetails());

      expect(text).toContain('RESIDENT CONTACT');
      expect(text).toContain('Kamala Silva');
      expect(text).toContain('+94-71-987-6543');
    });

    it('safely displays "Not provided" when contact fields are missing without displaying undefined or null', () => {
      const requestWithoutContact: SafeResponseRequest = {
        ...sampleAssignedRequest,
        contact: {
          name: '',
          phoneNumber: ''
        }
      };
      updateCachedResponderRequest(requestWithoutContact);
      vi.mocked(getResponderRequestById).mockResolvedValue(requestWithoutContact);

      const text = screenText(renderDetails());

      expect(text).toContain('RESIDENT CONTACT');
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('null');
      expect(text).not.toContain('NaN');
    });
  });

  describe('LDFEW-362: Call Resident Action', () => {
    it('renders the "Call Resident" action button when viewing request details', () => {
      const buttons = screenButtons(renderDetails());
      const callButton = buttons.find((b) => b.accessibilityLabel === 'Call Resident');

      expect(callButton).toBeDefined();
      expect(callButton?.disabled).toBe(false);
    });

    it('invokes initiateResidentCall with the actual selected resident phone number when pressed', () => {
      const callSpy = vi.spyOn(contactLocationUi, 'initiateResidentCall');

      const buttons = screenButtons(renderDetails());
      const callButton = buttons.find((b) => b.accessibilityLabel === 'Call Resident');
      expect(callButton).toBeDefined();

      callButton?.onPress();

      expect(callSpy).toHaveBeenCalledWith('+94 77 123 4567');
    });

    it('disables the "Call Resident" button and does not crash when phone number is missing or invalid', () => {
      const callSpy = vi.spyOn(contactLocationUi, 'initiateResidentCall');

      const requestMissingPhone: SafeResponseRequest = {
        ...sampleAssignedRequest,
        contact: {
          name: 'Sunil Perera',
          phoneNumber: ''
        }
      };
      updateCachedResponderRequest(requestMissingPhone);
      vi.mocked(getResponderRequestById).mockResolvedValue(requestMissingPhone);

      const buttons = screenButtons(renderDetails());
      const callButton = buttons.find((b) => b.accessibilityLabel === 'Call Resident');

      expect(callButton).toBeDefined();
      expect(callButton?.disabled).toBe(true);
      expect(callButton?.accessibilityState?.disabled).toBe(true);

      // A stale/direct handler invocation is guarded too, beyond the disabled UI.
      callButton?.onPress();
      expect(callSpy).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith('Phone number unavailable', 'Refresh the request details and try again.');
    });
  });

  describe('LDFEW-363: Display Emergency GPS / Location Clearly', () => {
    it('clearly displays Latitude and Longitude from the selected request', () => {
      const text = screenText(renderDetails());

      expect(text).toContain('EMERGENCY LOCATION');
      expect(text).toContain('Latitude');
      expect(text).toContain('6.927079');
      expect(text).toContain('Longitude');
      expect(text).toContain('79.86124');
    });

    it('displays coordinates correctly for pending (NEW) request', () => {
      lifecycle.params = { requestId: samplePendingRequest.id };
      updateCachedResponderRequest(samplePendingRequest);
      vi.mocked(getResponderRequestById).mockResolvedValue(samplePendingRequest);

      const text = screenText(renderDetails());

      expect(text).toContain('EMERGENCY LOCATION');
      expect(text).toContain('7.2906');
      expect(text).toContain('80.217');
    });

    it('safely displays "Not provided" when coordinates are missing and avoids undefined/null/NaN', () => {
      const requestWithoutCoords: SafeResponseRequest = {
        ...sampleAssignedRequest,
        location: {
          type: 'Point',
          coordinates: [] as unknown as [number, number]
        }
      };
      updateCachedResponderRequest(requestWithoutCoords);
      vi.mocked(getResponderRequestById).mockResolvedValue(requestWithoutCoords);

      const text = screenText(renderDetails());

      expect(text).toContain('EMERGENCY LOCATION');
      expect(text).toContain('Latitude');
      expect(text).toContain('Not provided');
      expect(text).toContain('Longitude');
      expect(text).toContain('Not provided');
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('null');
      expect(text).not.toContain('NaN');
    });
  });

  describe('LDFEW-365: View Location / Route Action', () => {
    it('renders the "View Location / Route" action in the emergency location section', () => {
      const buttons = screenButtons(renderDetails());
      const viewRouteButton = buttons.find((b) => b.accessibilityLabel === 'View Location / Route');

      expect(viewRouteButton).toBeDefined();
      expect(viewRouteButton?.disabled).toBe(false);
    });

    it('invokes initiateViewLocationRoute with the real latitude and longitude when pressed', () => {
      const routeSpy = vi.spyOn(contactLocationUi, 'initiateViewLocationRoute');

      const buttons = screenButtons(renderDetails());
      const viewRouteButton = buttons.find((b) => b.accessibilityLabel === 'View Location / Route');
      expect(viewRouteButton).toBeDefined();

      viewRouteButton?.onPress();

      expect(routeSpy).toHaveBeenCalledWith(6.927079, 79.86124);
    });

    it('disables "View Location / Route" action when coordinates are missing or invalid without crashing', () => {
      const routeSpy = vi.spyOn(contactLocationUi, 'initiateViewLocationRoute');

      const requestInvalidCoords: SafeResponseRequest = {
        ...sampleAssignedRequest,
        location: {
          type: 'Point',
          coordinates: [Number.NaN, Number.NaN] as unknown as [number, number]
        }
      };
      updateCachedResponderRequest(requestInvalidCoords);
      vi.mocked(getResponderRequestById).mockResolvedValue(requestInvalidCoords);

      const buttons = screenButtons(renderDetails());
      const viewRouteButton = buttons.find((b) => b.accessibilityLabel === 'View Location / Route');

      expect(viewRouteButton).toBeDefined();
      expect(viewRouteButton?.disabled).toBe(true);
      expect(viewRouteButton?.accessibilityState?.disabled).toBe(true);

      // Safe invocation does not trigger route action
      viewRouteButton?.onPress();
      expect(routeSpy).not.toHaveBeenCalled();
    });
  });
});
