import * as React from 'react';
import { EMERGENCY_CONTACT_PHONE_MESSAGE, EMERGENCY_VULNERABLE_COUNT_KEYS } from '@safealert/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmergencyAssistanceScreen } from './EmergencyAssistanceScreen';
import { validateEmergencyAssistanceDraft, type EmergencyAssistanceDraft } from '../emergencyAssistanceDraft';
import { mapRequestToEditForm, validateResidentEmergencyRequestEditForm } from './ResidentEmergencyRequestEditScreen';
import type { SafeResponseRequest } from '@safealert/contracts';

const state = vi.hoisted(() => ({ draft: {} as EmergencyAssistanceDraft, push: vi.fn(), phoneTouched: false }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(), useEffect: () => undefined,
  useState: () => [state.phoneTouched, (value: boolean) => { state.phoneTouched = value; }]
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push, back: vi.fn() }), useFocusEffect: () => undefined, useLocalSearchParams: () => ({}) }));
vi.mock('react-native', () => ({
  ActivityIndicator: 'progress', Pressable: 'button', Text: 'span', TextInput: 'input', View: 'div',
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ user: { name: 'Resident', email: 'resident@example.com' } }) }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../../shared/currentLocation', () => ({ captureCurrentLocation: vi.fn(), formatCoordinate: (value: number) => value.toFixed(6) }));
vi.mock('../emergencyAssistanceDraft', async (importOriginal) => {
  const original = await importOriginal<typeof import('../emergencyAssistanceDraft')>();
  return { ...original, useEmergencyAssistanceDraft: () => ({
    draft: state.draft, validation: original.validateEmergencyAssistanceDraft(state.draft),
    setDraft: (update: React.SetStateAction<EmergencyAssistanceDraft>) => {
      state.draft = typeof update === 'function' ? update(state.draft) : update;
    }
  }) };
});

type NodeProps = {
  children?: React.ReactNode; accessibilityLabel?: string; accessibilityState?: { disabled?: boolean };
  disabled?: boolean; onPress?: () => void; onChangeText?: (value: string) => void; value?: string;
  maxLength?: number; keyboardType?: string; inputMode?: string; onBlur?: () => void;
};
function nodes(node: React.ReactNode): React.ReactElement<NodeProps>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<NodeProps>(node)) return [];
  if (typeof node.type === 'function') return nodes((node.type as (props: unknown) => React.ReactNode)(node.props));
  return [node, ...nodes(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement<NodeProps>(node)) return '';
  if (typeof node.type === 'function') return text((node.type as (props: unknown) => React.ReactNode)(node.props));
  return text(node.props.children);
}
function control(label: string) {
  const found = nodes(EmergencyAssistanceScreen()).find((node) => node.props.accessibilityLabel === label);
  expect(found, label).toBeDefined();
  return found!.props;
}
function editForm() {
  const request: SafeResponseRequest = {
    id: '507f1f77bcf86cd799439011', residentId: 'resident', status: 'NEW', assistanceType: 'MEDICAL_ASSISTANCE',
    location: { type: 'Point', coordinates: [79.86, 6.92] }, affectedPeople: 8, medicalNeeds: true, injuredPeople: 0,
    vulnerablePeople: { ...state.draft.vulnerablePeople }, roadAccessibility: 'LIMITED',
    contact: { name: 'Resident', email: 'resident@example.com', phoneNumber: '0771234567' },
    description: 'Please send medical assistance.', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z'
  };
  return mapRequestToEditForm(request);
}
beforeEach(() => {
  vi.clearAllMocks();
  state.phoneTouched = false;
  vi.stubGlobal('React', React);
  state.draft = {
    assistanceType: 'MEDICAL_ASSISTANCE', location: { status: 'DETECTED', latitude: 6.92, longitude: 79.86, accuracyMeters: 10, capturedAt: '2026-10-01T10:00:00.000Z', errorMessage: null },
    affectedPeopleCount: 8, medicalNeeds: { requiresMedicalAssistance: true, injuredCount: 0 },
    vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 }, accessCondition: 'LIMITED',
    contactDetails: { name: 'Resident', email: 'resident@example.com', phoneNumber: '0771234567', usesAuthenticatedProfile: true },
    emergencyDescription: 'Please send medical assistance.', specialRequirements: '', reviewRequestedAt: null
  };
});

describe('Resident emergency assistance count controls', () => {
  it.each([
    ['children', 'Children'], ['elderlyPeople', 'Elderly people'],
    ['personsWithDisabilities', 'Persons with disabilities'], ['pregnantPersons', 'Pregnant persons'],
    ['injuredCount', 'injured people']
  ])('lets %s reach eight, disables increment at the total, and stops decrement at zero', (key, label) => {
    const count = () => key === 'injuredCount' ? state.draft.medicalNeeds.injuredCount : state.draft.vulnerablePeople[key as keyof EmergencyAssistanceDraft['vulnerablePeople']];
    for (let value = 1; value <= 8; value += 1) {
      expect(control(`Increase ${label}`).disabled).toBe(false);
      control(`Increase ${label}`).onPress?.();
      expect(count()).toBe(value);
    }
    expect(control(`Increase ${label}`).disabled).toBe(true);
    expect(control(`Increase ${label}`).accessibilityState?.disabled).toBe(true);
    control(`Increase ${label}`).onPress?.();
    expect(count()).toBe(8);
    expect(text(EmergencyAssistanceScreen())).toContain('Maximum is 8 because 8 people are reported as needing assistance.');
    for (let value = 7; value >= 0; value -= 1) {
      control(`Decrease ${label}`).onPress?.();
      expect(count()).toBe(value);
    }
    expect(control(`Decrease ${label}`).disabled).toBe(true);
    control(`Decrease ${label}`).onPress?.();
    expect(count()).toBe(0);
  });

  it('preserves dependent counts on a reduced total and blocks review until corrected', () => {
    state.draft.vulnerablePeople.children = 7;
    state.draft.medicalNeeds.injuredCount = 6;
    for (let i = 0; i < 4; i += 1) control('Decrease affected people').onPress?.();
    expect(state.draft.affectedPeopleCount).toBe(4);
    expect(state.draft.vulnerablePeople.children).toBe(7);
    expect(state.draft.medicalNeeds.injuredCount).toBe(6);
    expect(control('Review emergency assistance request').disabled).toBe(true);
    control('Review emergency assistance request').onPress?.();
    expect(state.push).not.toHaveBeenCalled();
    expect(text(EmergencyAssistanceScreen())).toContain('Each vulnerable-person count must be at most 4');
    expect(text(EmergencyAssistanceScreen())).toContain('Injured people cannot exceed the total affected people.');
    for (let i = 0; i < 3; i += 1) control('Decrease Children').onPress?.();
    for (let i = 0; i < 2; i += 1) control('Decrease injured people').onPress?.();
    expect(control('Review emergency assistance request').disabled).toBe(false);
    control('Review emergency assistance request').onPress?.();
    expect(state.push).toHaveBeenCalledWith('/resident/review-emergency-request');
  });

  it.each(EMERGENCY_VULNERABLE_COUNT_KEYS)('applies the same per-category bounds to creation and NEW editing for %s', (key) => {
    for (const count of [-1, 1.5, 9]) {
      state.draft.vulnerablePeople[key] = count;
      expect(validateEmergencyAssistanceDraft(state.draft).errors.vulnerablePeople).toBeDefined();
      const form = editForm();
      form.vulnerablePeople = { ...state.draft.vulnerablePeople };
      expect(validateResidentEmergencyRequestEditForm(form).errors.vulnerablePeople).toBeDefined();
    }
    state.draft.vulnerablePeople[key] = 8;
    expect(validateEmergencyAssistanceDraft(state.draft).isValid).toBe(true);
    expect(validateResidentEmergencyRequestEditForm(editForm()).isValid).toBe(true);
  });

  it('allows overlapping vulnerable categories whose sum exceeds the total', () => {
    for (const key of EMERGENCY_VULNERABLE_COUNT_KEYS) state.draft.vulnerablePeople[key] = 8;
    expect(validateEmergencyAssistanceDraft(state.draft).isValid).toBe(true);
    expect(validateResidentEmergencyRequestEditForm(editForm()).isValid).toBe(true);
  });
});

describe('Emergency contact exact-digit validation', () => {
  it.each(['', '077123456', '07712345678', '077ABC4567', '077-123-4567', '077 123456', ' 0771234567', '0771234567 ', '+771234567'])('rejects raw invalid %j in creation and editing validators', (phoneNumber) => {
    state.draft.contactDetails.phoneNumber = phoneNumber;
    expect(validateEmergencyAssistanceDraft(state.draft).errors.contactDetails).toBe(EMERGENCY_CONTACT_PHONE_MESSAGE);
    expect(control('Review emergency assistance request').disabled).toBe(true);
    const form = editForm();
    form.contact.phoneNumber = phoneNumber;
    expect(validateResidentEmergencyRequestEditForm(form).errors.contactDetails).toBe(EMERGENCY_CONTACT_PHONE_MESSAGE);
  });

  it.each([
    ['0771234567', '0771234567'], ['0712345678', '0712345678'], ['077123456', '077123456'],
    ['07712345678', '0771234567'], ['yes no', ''], ['abcd1234', '1234'], ['077ABC4567', '0774567'],
    ['077ABC12-34567', '0771234567'], ['077-1234567', '0771234567'], ['077 1234567', '0771234567'],
    ['+ (077) 123.4567', '0771234567'], ['', '']
  ])('sanitizes create input %j into %j before Review', (phoneNumber, expected) => {
    const input = control('Contact phone number');
    expect(input.keyboardType).toBe('number-pad');
    expect(input.inputMode).toBe('numeric');
    // Mixed-content pastes must reach the sanitizer before a raw-character limit can truncate them.
    expect(input.maxLength).toBeUndefined();
    input.onChangeText?.(phoneNumber);
    expect(control('Contact phone number').value).toBe(expected);
    expect(control('Review emergency assistance request').disabled).toBe(expected.length !== 10);
    if (expected.length !== 10) expect(text(EmergencyAssistanceScreen())).toContain(EMERGENCY_CONTACT_PHONE_MESSAGE);
    control('Review emergency assistance request').onPress?.();
    expect(state.push).toHaveBeenCalledTimes(expected.length === 10 ? 1 : 0);
  });

  it('delays the empty phone error until interaction or a Review attempt', () => {
    state.draft.contactDetails.phoneNumber = '';
    expect(text(EmergencyAssistanceScreen())).not.toContain(EMERGENCY_CONTACT_PHONE_MESSAGE);
    control('Contact phone number').onBlur?.();
    expect(text(EmergencyAssistanceScreen())).toContain(EMERGENCY_CONTACT_PHONE_MESSAGE);
    state.phoneTouched = false;
    control('Review emergency assistance request').onPress?.();
    expect(text(EmergencyAssistanceScreen())).toContain(EMERGENCY_CONTACT_PHONE_MESSAGE);
    expect(state.push).not.toHaveBeenCalled();
  });

  it('accepts exactly ten numeric digits in both validators', () => {
    expect(validateEmergencyAssistanceDraft(state.draft).isValid).toBe(true);
    expect(validateResidentEmergencyRequestEditForm(editForm()).isValid).toBe(true);
  });
});
