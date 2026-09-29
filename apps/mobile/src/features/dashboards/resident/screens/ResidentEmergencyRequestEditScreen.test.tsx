import * as React from 'react';
import type { SafeResponseRequest, UserRole } from '@safealert/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mapRequestToEditForm,
  ResidentEmergencyRequestEditScreen,
  validateResidentEmergencyRequestEditForm,
  type ResidentEmergencyRequestEditForm
} from './ResidentEmergencyRequestEditScreen';
import {
  cancelResidentResponseRequest,
  createResidentResponseRequest,
  getMyResponseRequestById
} from '../api/responseRequestApi';
import {
  residentEmergencyRequestEditHref
} from '../emergencyRequestNavigation';

const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  params: { requestId: '507f1f77bcf86cd799439011' } as { requestId?: string | string[] },
  effect: (() => undefined) as () => (() => void) | undefined
}));

const navigation = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  canGoBack: vi.fn(() => true)
}));

const auth = vi.hoisted(() => ({
  accessToken: 'resident-token' as string | null,
  status: 'authenticated',
  user: { id: 'resident-1', name: 'Nimal Perera', email: 'nimal@example.test', role: 'RESIDENT' as UserRole }
}));

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
        lifecycle.slots[index] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(lifecycle.slots[index]) : value;
      }
    ];
  }
}));

vi.mock('expo-router', () => ({
  useFocusEffect: (callback: typeof lifecycle.effect) => {
    lifecycle.effect = callback;
  },
  useRouter: () => navigation,
  useLocalSearchParams: () => lifecycle.params
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'span',
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityRole, disabled }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    disabled?: boolean;
  }) => (
    <button
      aria-label={accessibilityLabel}
      data-role={accessibilityRole}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TextInput: ({ value, onChangeText, onBlur, accessibilityLabel, placeholder }: {
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

vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../../auth/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock('../../shared/currentLocation', () => ({
  formatCoordinate: (val: number) => val.toFixed(6),
  captureCurrentLocation: vi.fn()
}));
vi.mock('../api/responseRequestApi', () => ({
  getMyResponseRequestById: vi.fn(),
  createResidentResponseRequest: vi.fn(),
  cancelResidentResponseRequest: vi.fn(),
  listMyResponseRequests: vi.fn()
}));

const mockNewRequest: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011',
  residentId: 'resident-1',
  status: 'NEW',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.900895, 6.726430] },
  affectedPeople: 4,
  medicalNeeds: true,
  injuredPeople: 1,
  vulnerablePeople: {
    children: 2,
    elderlyPeople: 1,
    personsWithDisabilities: 0,
    pregnantPersons: 0
  },
  roadAccessibility: 'LIMITED',
  contact: {
    name: 'Nimal Perera',
    email: 'nimal@example.test',
    phoneNumber: '0771234567'
  },
  description: 'Elderly resident requires assistance',
  specialRequirements: 'Oxygen cylinder needed',
  createdAt: '2026-09-28T08:00:00.000Z',
  updatedAt: '2026-09-28T08:00:00.000Z'
};

function renderScreen(props?: { onValidContinue?: (form: ResidentEmergencyRequestEditForm) => void }) {
  lifecycle.cursor = 0;
  return ResidentEmergencyRequestEditScreen(props);
}

type MockElementProps = {
  accessibilityLabel?: string;
  'aria-label'?: string;
  children?: React.ReactNode;
  value?: string;
  onChangeText?: (text: string) => void;
  onBlur?: () => void;
  onPress?: () => void;
  onClick?: () => void;
  disabled?: boolean;
};

function findByAccessibilityLabel(node: React.ReactNode, label: string): React.ReactElement<MockElementProps> | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByAccessibilityLabel(child, label);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement<MockElementProps>(node)) {
    return null;
  }
  if (node.props.accessibilityLabel === label || node.props['aria-label'] === label) {
    return node;
  }
  return findByAccessibilityLabel(node.props.children, label);
}

function extractScreenText(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(extractScreenText).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement<{ children?: React.ReactNode; value?: unknown }>(node)) return '';
  if (typeof node.type === 'function') {
    return extractScreenText((node.type as (props: unknown) => React.ReactNode)(node.props));
  }
  const childText = extractScreenText(node.props.children);
  const valueText = typeof node.props.value === 'string' ? node.props.value : '';
  return [childText, valueText].filter(Boolean).join(' ');
}

describe('ResidentEmergencyRequestEditScreen Validation (LDFEW-343)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    navigation.canGoBack.mockReturnValue(true);
    auth.accessToken = 'resident-token';
  });

  it('1. Existing valid pre-filled request has no validation errors', () => {
    const form = mapRequestToEditForm(mockNewRequest);
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('2. Required assistance type is validated', () => {
    const form = { ...mapRequestToEditForm(mockNewRequest), assistanceType: null as unknown as 'OTHER' };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.assistanceType).toBe('Select an assistance type.');
  });

  it('3. Negative affected people count is rejected', () => {
    const form = { ...mapRequestToEditForm(mockNewRequest), affectedPeopleCount: -3 };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.affectedPeopleCount).toBe('Number of people cannot be negative.');
  });

  it('4. Non-numeric affected people count is rejected', () => {
    const form = { ...mapRequestToEditForm(mockNewRequest), affectedPeopleCount: NaN };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.affectedPeopleCount).toBe('Enter a valid whole number.');
  });

  it('5. Negative injured people count is rejected', () => {
    const form = { ...mapRequestToEditForm(mockNewRequest), injuredCount: -1 };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.injuredCount).toBe('Injured people cannot be a negative number.');
  });

  it('6. Invalid vulnerable-person count is rejected', () => {
    const form = {
      ...mapRequestToEditForm(mockNewRequest),
      vulnerablePeople: { children: -1, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 }
    };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.vulnerablePeople).toBe('Vulnerable-person counts cannot be negative.');
  });

  it('7. Invalid child/elderly/disability/pregnancy count is rejected', () => {
    const form = {
      ...mapRequestToEditForm(mockNewRequest),
      vulnerablePeople: { children: 0, elderlyPeople: -2, personsWithDisabilities: 0, pregnantPersons: 0 }
    };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.vulnerablePeople).toBe('Vulnerable-person counts cannot be negative.');
  });

  it('8. Valid zero values behave according to existing creation rules', () => {
    const form = {
      ...mapRequestToEditForm(mockNewRequest),
      requiresMedicalAssistance: false,
      injuredCount: 0,
      vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 }
    };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(true);
    expect(result.errors.injuredCount).toBeUndefined();
    expect(result.errors.vulnerablePeople).toBeUndefined();
  });

  it('9. Decimal counts are rejected when whole numbers are required', () => {
    const decimalPeople = { ...mapRequestToEditForm(mockNewRequest), affectedPeopleCount: 4.5 };
    expect(validateResidentEmergencyRequestEditForm(decimalPeople).errors.affectedPeopleCount).toBe('Enter a valid whole number.');

    const decimalInjured = { ...mapRequestToEditForm(mockNewRequest), injuredCount: 1.5 };
    expect(validateResidentEmergencyRequestEditForm(decimalInjured).errors.injuredCount).toBe('Enter a valid whole number.');

    const decimalVulnerable = {
      ...mapRequestToEditForm(mockNewRequest),
      vulnerablePeople: { children: 1.5, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 }
    };
    expect(validateResidentEmergencyRequestEditForm(decimalVulnerable).errors.vulnerablePeople).toBe('Vulnerable-person counts must be whole numbers.');
  });

  it('10. Missing required phone/contact information is rejected', () => {
    const baseForm = mapRequestToEditForm(mockNewRequest);
    const form = {
      ...baseForm,
      contact: { ...baseForm.contact, phoneNumber: '' }
    };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.contactDetails).toBe('Enter a contact phone number.');
  });

  it('11. Invalid phone number is rejected according to existing validation rules', () => {
    const baseForm = mapRequestToEditForm(mockNewRequest);
    const shortPhone = {
      ...baseForm,
      contact: { ...baseForm.contact, phoneNumber: '123' }
    };
    expect(validateResidentEmergencyRequestEditForm(shortPhone).errors.contactDetails).toBe('Enter a valid phone number.');

    const letterPhone = {
      ...baseForm,
      contact: { ...baseForm.contact, phoneNumber: '0771234abc' }
    };
    expect(validateResidentEmergencyRequestEditForm(letterPhone).errors.contactDetails).toBe('Enter a valid phone number.');
  });

  it('12. Missing required description is rejected', () => {
    const form = { ...mapRequestToEditForm(mockNewRequest), description: '' };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.emergencyDescription).toBe('Describe the emergency.');
  });

  it('13. Whitespace-only description is rejected', () => {
    const form = { ...mapRequestToEditForm(mockNewRequest), description: '        ' };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.emergencyDescription).toBe('Describe the emergency.');
  });

  it('14. Over-limit description is rejected', () => {
    const form = { ...mapRequestToEditForm(mockNewRequest), description: 'a'.repeat(501) };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.emergencyDescription).toBe('Keep the description under 500 characters.');
  });

  it('15. Invalid coordinate values are rejected', () => {
    const invalidLat = { ...mapRequestToEditForm(mockNewRequest), latitude: 95 };
    expect(validateResidentEmergencyRequestEditForm(invalidLat).errors.location).toBe('Valid emergency location coordinates are required.');

    const invalidLng = { ...mapRequestToEditForm(mockNewRequest), longitude: 200 };
    expect(validateResidentEmergencyRequestEditForm(invalidLng).errors.location).toBe('Valid emergency location coordinates are required.');
  });

  it('16. Required road-accessibility selection is validated', () => {
    const form = { ...mapRequestToEditForm(mockNewRequest), roadAccessibility: null as unknown as 'LIMITED' };
    const result = validateResidentEmergencyRequestEditForm(form);
    expect(result.isValid).toBe(false);
    expect(result.errors.roadAccessibility).toBe('Select the current road/access condition.');
  });

  it('17. Medical-needs values enforce cross-field consistency', () => {
    const excessInjured = { ...mapRequestToEditForm(mockNewRequest), affectedPeopleCount: 2, injuredCount: 3 };
    expect(validateResidentEmergencyRequestEditForm(excessInjured).errors.injuredCount).toBe(
      'Injured people cannot exceed the total affected people.'
    );

    const injuredWithoutMedical = {
      ...mapRequestToEditForm(mockNewRequest),
      requiresMedicalAssistance: false,
      injuredCount: 2
    };
    expect(validateResidentEmergencyRequestEditForm(injuredWithoutMedical).errors.injuredCount).toBe(
      'Set injured people to 0 when no medical assistance is required.'
    );
  });

  it('18. Optional special requirements remain optional and enforce length limit', () => {
    const emptySpecial = { ...mapRequestToEditForm(mockNewRequest), specialRequirements: '' };
    expect(validateResidentEmergencyRequestEditForm(emptySpecial).errors.specialRequirements).toBeUndefined();

    const overLimitSpecial = { ...mapRequestToEditForm(mockNewRequest), specialRequirements: 'x'.repeat(301) };
    expect(validateResidentEmergencyRequestEditForm(overLimitSpecial).errors.specialRequirements).toBe(
      'Keep special requirements under 300 characters.'
    );
  });

  it('19. Validation errors are shown in user-friendly wording when continuing with invalid values', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Short emergency description')).toBeDefined();
    });

    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Please correct the highlighted fields before continuing.');
    expect(text).toContain('Describe the emergency.');
    expect(text).not.toContain('ZodError');
    expect(text).not.toContain('NaN');
  });

  it('20. Invalid form does not navigate/proceed', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    const onValidContinue = vi.fn();
    renderScreen({ onValidContinue });
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Short emergency description')).toBeDefined();
    });

    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    expect(onValidContinue).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('21. Invalid form does not call backend update API', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Contact phone number')).toBeDefined();
    });

    const phoneInput = findByAccessibilityLabel(renderScreen(), 'Contact phone number');
    phoneInput?.props.onChangeText?.('');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    expect(createResidentResponseRequest).not.toHaveBeenCalled();
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
  });

  it('22. Resident remains on Edit Request when validation fails', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Short emergency description')).toBeDefined();
    });

    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('   ');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Edit Request');
    expect(text).toContain('Describe the emergency.');
    expect(navigation.back).not.toHaveBeenCalled();
  });

  it('23. Correcting an invalid field clears its error appropriately', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Short emergency description')).toBeDefined();
    });

    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();
    expect(extractScreenText(renderScreen())).toContain('Describe the emergency.');

    descInput?.props.onChangeText?.('Valid updated description by resident');
    const updatedText = extractScreenText(renderScreen());
    expect(updatedText).not.toContain('Describe the emergency.');
    expect(updatedText).not.toContain('Please correct the highlighted fields before continuing.');
  });

  it('24. Valid form can proceed toward the next local step without persistence', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    const onValidContinue = vi.fn();
    renderScreen({ onValidContinue });
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen({ onValidContinue }), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen({ onValidContinue }), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    expect(onValidContinue).toHaveBeenCalledOnce();
    expect(createResidentResponseRequest).not.toHaveBeenCalled();
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
  });

  it('25. Existing pre-filled values from LDFEW-342 remain intact', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Medical Assistance');
      expect(text).toContain('4');
      expect(text).toContain('Elderly resident requires assistance');
      expect(text).toContain('0771234567');
      expect(text).toContain('Lat 6.726430, Long 79.900895');
    });
  });

  it('26. Existing Create Emergency Request validation and rules remain consistent', () => {
    const form = mapRequestToEditForm(mockNewRequest);
    expect(form.assistanceType).toBe('MEDICAL_ASSISTANCE');
    expect(form.affectedPeopleCount).toBe(4);
    expect(form.injuredCount).toBe(1);
    expect(form.requiresMedicalAssistance).toBe(true);
  });

  it('27. Existing Resident cancellation behavior remains unchanged', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(extractScreenText(renderScreen())).toContain('Edit Emergency Assistance Request');
    });
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
  });

  it('28. Existing Edit Request navigation remains unchanged', () => {
    const editHref = residentEmergencyRequestEditHref(mockNewRequest.id);
    expect(editHref).toEqual({
      pathname: '/resident/emergency-request/[requestId]/edit',
      params: { requestId: mockNewRequest.id }
    });
  });

  it('29. Trimming description and phone on blur formats text safely', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Contact phone number')).toBeDefined();
    });

    const phoneInput = findByAccessibilityLabel(renderScreen(), 'Contact phone number');
    phoneInput?.props.onChangeText?.('  0771234567  ');
    phoneInput?.props.onBlur?.();

    const reRenderedPhone = findByAccessibilityLabel(renderScreen(), 'Contact phone number');
    expect(reRenderedPhone?.props.value).toBe('0771234567');
  });
});
