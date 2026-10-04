import * as React from 'react';
import type { SafeResponseRequest, UserRole } from '@safealert/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mapRequestToEditForm,
  ResidentEmergencyRequestEditScreen,
  ResidentEmergencyRequestReviewView,
  validateResidentEmergencyRequestEditForm,
  type ResidentEmergencyRequestEditScreenProps
} from './ResidentEmergencyRequestEditScreen';
import {
  ResidentEmergencyRequestDetailsScreen,
  type ResidentEmergencyRequestDetailsScreenProps
} from './ResidentEmergencyRequestDetailsScreen';
import {
  cancelResidentResponseRequest,
  createResidentResponseRequest,
  getMyResponseRequestById,
  updateResidentResponseRequest
} from '../api/responseRequestApi';
import { ApiClientError } from '../../../../services/api/client';
import {
  residentEmergencyRequestEditHref,
  residentEmergencyRequestReviewHref
} from '../emergencyRequestNavigation';

const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  params: { requestId: '507f1f77bcf86cd799439011' } as {
    requestId?: string | string[];
    refreshed?: string;
    updated?: string;
  },
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
  listMyResponseRequests: vi.fn(),
  updateResidentResponseRequest: vi.fn()
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

function renderScreen(props?: ResidentEmergencyRequestEditScreenProps) {
  lifecycle.cursor = 0;
  return ResidentEmergencyRequestEditScreen(props);
}

function renderDetailsScreen(props?: ResidentEmergencyRequestDetailsScreenProps) {
  lifecycle.cursor = 0;
  return ResidentEmergencyRequestDetailsScreen(props);
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
  if (typeof node.type === 'function') {
    const rendered = (node.type as (props: unknown) => React.ReactNode)(node.props);
    const found = findByAccessibilityLabel(rendered, label);
    if (found) return found;
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

  it.each(['Children', 'Elderly people', 'Persons with disabilities', 'Pregnant persons', 'injured people'])(
    'edit counter for %s reaches the total of 8 and stops at both bounds', async (label) => {
      vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: {
        ...mockNewRequest, affectedPeople: 8, injuredPeople: 0,
        vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 }
      } });
      renderScreen();
      lifecycle.effect?.();
      await vi.waitFor(() => expect(findByAccessibilityLabel(renderScreen(), `Increase ${label}`)).not.toBeNull());
      for (let count = 0; count < 8; count += 1) {
        const increase = findByAccessibilityLabel(renderScreen(), `Increase ${label}`);
        expect(increase?.props.disabled).toBe(false);
        increase?.props.onPress?.();
      }
      expect(findByAccessibilityLabel(renderScreen(), `Increase ${label}`)?.props.disabled).toBe(true);
      findByAccessibilityLabel(renderScreen(), `Increase ${label}`)?.props.onPress?.();
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')?.props.disabled).toBe(false);
      for (let count = 8; count > 0; count -= 1) {
        findByAccessibilityLabel(renderScreen(), `Decrease ${label}`)?.props.onPress?.();
      }
      expect(findByAccessibilityLabel(renderScreen(), `Decrease ${label}`)?.props.disabled).toBe(true);
      findByAccessibilityLabel(renderScreen(), `Decrease ${label}`)?.props.onPress?.();
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')?.props.disabled).toBe(false);
    }
  );

  it('edit preserves dependent counts when total drops and blocks review until corrected', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: {
      ...mockNewRequest, affectedPeople: 8, injuredPeople: 6,
      vulnerablePeople: { ...mockNewRequest.vulnerablePeople, children: 7 }
    } });
    const onValidContinue = vi.fn();
    renderScreen({ onValidContinue });
    lifecycle.effect?.();
    await vi.waitFor(() => expect(findByAccessibilityLabel(renderScreen(), 'Decrease affected people')).not.toBeNull());
    for (let count = 8; count > 4; count -= 1) {
      findByAccessibilityLabel(renderScreen(), 'Decrease affected people')?.props.onPress?.();
    }
    expect(extractScreenText(renderScreen())).toContain('Each vulnerable-person count must be at most 4');
    expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')?.props.disabled).toBe(true);
    findByAccessibilityLabel(renderScreen(), 'Review Changes')?.props.onPress?.();
    expect(onValidContinue).not.toHaveBeenCalled();
    expect(updateResidentResponseRequest).not.toHaveBeenCalled();
    for (let count = 7; count > 4; count -= 1) {
      findByAccessibilityLabel(renderScreen(), 'Decrease Children')?.props.onPress?.();
    }
    for (let count = 6; count > 4; count -= 1) {
      findByAccessibilityLabel(renderScreen(), 'Decrease injured people')?.props.onPress?.();
    }
    expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')?.props.disabled).toBe(false);
    findByAccessibilityLabel(renderScreen({ onValidContinue }), 'Review Changes')?.props.onPress?.();
    expect(onValidContinue).toHaveBeenCalledWith(expect.objectContaining({
      affectedPeopleCount: 4, injuredCount: 4, vulnerablePeople: expect.objectContaining({ children: 4 })
    }));
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
    expect(result.errors.contactDetails).toBe('Enter a valid 10-digit contact phone number.');
  });

  it('11. Invalid phone number is rejected according to existing validation rules', () => {
    const baseForm = mapRequestToEditForm(mockNewRequest);
    const shortPhone = {
      ...baseForm,
      contact: { ...baseForm.contact, phoneNumber: '123' }
    };
    expect(validateResidentEmergencyRequestEditForm(shortPhone).errors.contactDetails).toBe('Enter a valid 10-digit contact phone number.');

    const letterPhone = {
      ...baseForm,
      contact: { ...baseForm.contact, phoneNumber: '0771234abc' }
    };
    expect(validateResidentEmergencyRequestEditForm(letterPhone).errors.contactDetails).toBe('Enter a valid 10-digit contact phone number.');
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

  it.each([
    ['0771234567', '0771234567'], ['0712345678', '0712345678'], ['07712345678', '0771234567'],
    ['yes no', ''], ['abcd1234', '1234'], ['077ABC4567', '0774567'], ['077ABC12-34567', '0771234567'],
    ['  0771234567  ', '0771234567'], ['077-1234567', '0771234567'], ['+ (077) 123.4567', '0771234567'],
    ['077123456', '077123456'], ['', '']
  ])('29. Edit sanitizes phone %j into %j and applies the same Review rule', async (phoneNumber, expected) => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Contact phone number')).toBeDefined();
    });

    const phoneInput = findByAccessibilityLabel(renderScreen(), 'Contact phone number');
    phoneInput?.props.onChangeText?.(phoneNumber);
    phoneInput?.props.onBlur?.();

    const reRenderedPhone = findByAccessibilityLabel(renderScreen(), 'Contact phone number');
    expect(reRenderedPhone?.props.value).toBe(expected);
    expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')?.props.disabled).toBe(expected.length !== 10);
    if (expected.length !== 10) expect(extractScreenText(renderScreen())).toContain('Enter a valid 10-digit contact phone number.');
  });

  it('keeps an untouched empty edit phone quiet until blur or Review, then clears the error when corrected', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: {
      ...mockNewRequest, contact: { ...mockNewRequest.contact, phoneNumber: '' }
    } });
    renderScreen(); lifecycle.effect?.();
    await vi.waitFor(() => expect(findByAccessibilityLabel(renderScreen(), 'Contact phone number')).not.toBeNull());
    expect(extractScreenText(renderScreen())).not.toContain('Enter a valid 10-digit contact phone number.');
    expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')?.props.disabled).toBe(true);
    findByAccessibilityLabel(renderScreen(), 'Contact phone number')?.props.onBlur?.();
    expect(extractScreenText(renderScreen())).toContain('Enter a valid 10-digit contact phone number.');
    findByAccessibilityLabel(renderScreen(), 'Contact phone number')?.props.onChangeText?.('0712345678');
    expect(extractScreenText(renderScreen())).not.toContain('Enter a valid 10-digit contact phone number.');
    expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')?.props.disabled).toBe(false);
  });

  it.each(['', '077123456', '07712345678', '077ABC4567', '077-1234567', '077 1234567'])(
    'blocks an invalid %j phone at the final read-only edit Review action', (phoneNumber) => {
      const form = mapRequestToEditForm(mockNewRequest);
      form.contact.phoneNumber = phoneNumber;
      const onConfirmChanges = vi.fn();
      const element = ResidentEmergencyRequestReviewView({ form, onBackToEdit: vi.fn(), onConfirmChanges });
      expect(extractScreenText(element)).toContain('Enter a valid 10-digit contact phone number.');
      const confirm = findByAccessibilityLabel(element, 'Confirm Changes');
      expect(confirm?.props.disabled).toBe(true);
      confirm?.props.onPress?.();
      expect(onConfirmChanges).not.toHaveBeenCalled();
      expect(updateResidentResponseRequest).not.toHaveBeenCalled();
    }
  );
});

describe('ResidentEmergencyRequestEditScreen Review Changes (LDFEW-344)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    navigation.canGoBack.mockReturnValue(true);
    auth.accessToken = 'resident-token';
    vi.mocked(updateResidentResponseRequest).mockResolvedValue({ responseRequest: mockNewRequest });
  });

  it('1. Valid edit form can open Review Changes', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Review Changes');
    expect(text).toContain('Review your updated emergency assistance information before confirming.');
    expect(findByAccessibilityLabel(renderScreen(), 'Back to Edit')).toBeDefined();
    expect(findByAccessibilityLabel(renderScreen(), 'Confirm Changes')).toBeDefined();
  });

  it('2. Invalid edit form cannot open Review Changes and displays errors', async () => {
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
    expect(text).toContain('Edit Emergency Assistance Request');
    expect(findByAccessibilityLabel(renderScreen(), 'Confirm Changes')).toBeNull();
  });

  it('3. Review screen displays edited assistance type with friendly label', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Flood Assistance')).toBeDefined();
    });

    const floodOption = findByAccessibilityLabel(renderScreen(), 'Flood Assistance');
    (floodOption?.props.onPress ?? floodOption?.props.onClick)?.();

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Flood Assistance');
    expect(text).not.toContain('FLOOD_ASSISTANCE');
  });

  it('4. Review screen displays edited affected people count', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Increase affected people')).toBeDefined();
    });

    const increaseAffected1 = findByAccessibilityLabel(renderScreen(), 'Increase affected people');
    (increaseAffected1?.props.onPress ?? increaseAffected1?.props.onClick)?.();
    const increaseAffected2 = findByAccessibilityLabel(renderScreen(), 'Increase affected people');
    (increaseAffected2?.props.onPress ?? increaseAffected2?.props.onClick)?.();

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Affected people 6');
  });

  it('5. Review screen displays edited injured people count', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Increase injured people')).toBeDefined();
    });

    const increaseInjured = findByAccessibilityLabel(renderScreen(), 'Increase injured people');
    (increaseInjured?.props.onPress ?? increaseInjured?.props.onClick)?.();

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Injured people 2');
  });

  it('6. Review screen displays vulnerable-person values', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Increase Children')).toBeDefined();
    });

    const increaseChildren = findByAccessibilityLabel(renderScreen(), 'Increase Children');
    (increaseChildren?.props.onPress ?? increaseChildren?.props.onClick)?.();

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Children 3');
    expect(text).toContain('Elderly people 1');
    expect(text).toContain('Persons with disabilities 0');
    expect(text).toContain('Pregnant persons 0');
  });

  it('7. Review screen displays edited medical needs', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'No')).toBeDefined();
    });

    const noButton = findByAccessibilityLabel(renderScreen(), 'No');
    (noButton?.props.onPress ?? noButton?.props.onClick)?.();

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Medical assistance No');
    expect(text).toContain('No medical assistance requested');
  });

  it('8. Review screen displays road accessibility with friendly label', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Blocked')).toBeDefined();
    });

    const blockedButton = findByAccessibilityLabel(renderScreen(), 'Blocked');
    (blockedButton?.props.onPress ?? blockedButton?.props.onClick)?.();

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Blocked');
    expect(text).not.toContain('BLOCKED');
  });

  it('9. Review screen displays edited description', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Short emergency description')).toBeDefined();
    });

    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('Water level rising fast, family on the roof');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Water level rising fast, family on the roof');
  });

  it('10. Review screen displays special requirements', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Special requirements')).toBeDefined();
    });

    const specialInput = findByAccessibilityLabel(renderScreen(), 'Special requirements');
    specialInput?.props.onChangeText?.('Wheelchair and clean water required');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Wheelchair and clean water required');
  });

  it('11. Review screen displays edited contact phone', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Contact phone number')).toBeDefined();
    });

    const phoneInput = findByAccessibilityLabel(renderScreen(), 'Contact phone number');
    phoneInput?.props.onChangeText?.('0779876543');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('0779876543');
  });

  it('12. Review screen displays saved emergency location appropriately', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Saved emergency location');
    expect(text).toContain('Latitude 6.726430');
    expect(text).toContain('Longitude 79.900895');
    expect(text).toContain('Preserved from your submitted request.');
  });

  it('13. Review screen uses friendly labels rather than raw enum values', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Medical Assistance');
    expect(text).toContain('Limited');
    expect(text).not.toContain('MEDICAL_ASSISTANCE');
    expect(text).not.toContain('LIMITED');
  });

  it('14. Optional empty special requirements render safely as None', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Special requirements')).toBeDefined();
    });

    const specialInput = findByAccessibilityLabel(renderScreen(), 'Special requirements');
    specialInput?.props.onChangeText?.('');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('None');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
    expect(text).not.toContain('[object Object]');
  });

  it('15. Review screen is read-only and does not display TextInputs', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    expect(findByAccessibilityLabel(renderScreen(), 'Short emergency description')).toBeNull();
    expect(findByAccessibilityLabel(renderScreen(), 'Contact phone number')).toBeNull();
    expect(findByAccessibilityLabel(renderScreen(), 'Special requirements')).toBeNull();
  });

  it('16. Back to Edit returns to edit form', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const backButton = findByAccessibilityLabel(renderScreen(), 'Back to Edit');
    (backButton?.props.onPress ?? backButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).toContain('Edit Emergency Assistance Request');
    expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
  });

  it('17. Back to Edit preserves all edited values', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Increase affected people')).toBeDefined();
    });

    const increaseAffected1 = findByAccessibilityLabel(renderScreen(), 'Increase affected people');
    (increaseAffected1?.props.onPress ?? increaseAffected1?.props.onClick)?.();
    const increaseAffected2 = findByAccessibilityLabel(renderScreen(), 'Increase affected people');
    (increaseAffected2?.props.onPress ?? increaseAffected2?.props.onClick)?.();

    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('Water is rising quickly, help urgently needed');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const reviewText = extractScreenText(renderScreen());
    expect(reviewText).toContain('Affected people 6');
    expect(reviewText).toContain('Water is rising quickly, help urgently needed');

    const backButton = findByAccessibilityLabel(renderScreen(), 'Back to Edit');
    (backButton?.props.onPress ?? backButton?.props.onClick)?.();

    const formText = extractScreenText(renderScreen());
    expect(formText).toContain('6');
    expect(formText).toContain('Water is rising quickly, help urgently needed');
    const preservedInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    expect(preservedInput?.props.value).toBe('Water is rising quickly, help urgently needed');
  });

  it('18. Header back button in review mode returns to edit preserving values', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('New emergency update notes');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    expect(extractScreenText(renderScreen())).toContain('Review Changes');

    const headerBack = findByAccessibilityLabel(renderScreen(), 'Go back');
    (headerBack?.props.onPress ?? headerBack?.props.onClick)?.();

    expect(extractScreenText(renderScreen())).toContain('Edit Emergency Assistance Request');
    const preservedInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    expect(preservedInput?.props.value).toBe('New emergency update notes');
  });

  it('19. Review Changes does not call backend update or mutation APIs', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    expect(createResidentResponseRequest).not.toHaveBeenCalled();
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
  });

  it('20. Confirm Changes connects to confirmation seam without persisting yet', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    const onConfirmChanges = vi.fn();
    renderScreen({ onConfirmChanges });
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen({ onConfirmChanges }), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen({ onConfirmChanges }), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen({ onConfirmChanges }), 'Confirm Changes');
    (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    expect(onConfirmChanges).toHaveBeenCalledOnce();
    expect(onConfirmChanges.mock.calls[0][0].affectedPeopleCount).toBe(4);
    expect(createResidentResponseRequest).not.toHaveBeenCalled();
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
  });

  it('21. No success message falsely claims the request was updated', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    const text = extractScreenText(renderScreen());
    expect(text).not.toContain('Request updated successfully');
    expect(text).not.toContain('Changes saved');
  });

  it('22. residentEmergencyRequestReviewHref produces valid href', () => {
    const reviewHref = residentEmergencyRequestReviewHref(mockNewRequest.id);
    expect(reviewHref).toEqual({
      pathname: '/resident/emergency-request/[requestId]/edit',
      params: { requestId: mockNewRequest.id, step: 'review' }
    });
  });

  it('23. Non-editable request does not enter review mode', async () => {
    const assignedRequest = { ...mockNewRequest, status: 'ASSIGNED' as const };
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: assignedRequest });
    renderScreen({ initialStep: 'review' });
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(extractScreenText(renderScreen({ initialStep: 'review' }))).toContain('Editing unavailable');
    });
    expect(findByAccessibilityLabel(renderScreen({ initialStep: 'review' }), 'Confirm Changes')).toBeNull();
    expect(findByAccessibilityLabel(renderScreen({ initialStep: 'review' }), 'Review Changes')).toBeNull();
  });

  it('24. Standalone ResidentEmergencyRequestReviewView renders all read-only fields accurately', () => {
    const form = mapRequestToEditForm(mockNewRequest);
    const onBackToEdit = vi.fn();
    const onConfirmChanges = vi.fn();
    const element = ResidentEmergencyRequestReviewView({
      form,
      onBackToEdit,
      onConfirmChanges
    });

    const text = extractScreenText(element);
    expect(text).toContain('Review Changes');
    expect(text).toContain('Medical Assistance');
    expect(text).toContain('Saved emergency location');
    expect(text).toContain('Affected people 4');
    expect(text).toContain('Injured people 1');
    expect(text).toContain('Medical assistance Yes');
    expect(text).toContain('1 injured people reported');
    expect(text).toContain('Children 2');
    expect(text).toContain('Elderly people 1');
    expect(text).toContain('Persons with disabilities 0');
    expect(text).toContain('Pregnant persons 0');
    expect(text).toContain('Limited');
    expect(text).toContain('Nimal Perera');
    expect(text).toContain('0771234567');
    expect(text).toContain('Elderly resident requires assistance');
    expect(text).toContain('Oxygen cylinder needed');

    const backButton = findByAccessibilityLabel(element, 'Back to Edit');
    (backButton?.props.onPress ?? backButton?.props.onClick)?.();
    expect(onBackToEdit).toHaveBeenCalledOnce();

    const confirmButton = findByAccessibilityLabel(element, 'Confirm Changes');
    (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();
    expect(onConfirmChanges).toHaveBeenCalledOnce();
    expect(onConfirmChanges).toHaveBeenCalledWith(form);
  });
});

describe('ResidentEmergencyRequestEditScreen Persistence (LDFEW-345)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    navigation.canGoBack.mockReturnValue(true);
    auth.accessToken = 'resident-token';
    vi.mocked(updateResidentResponseRequest).mockResolvedValue({ responseRequest: mockNewRequest });
  });

  it('1. Confirm Changes calls updateResidentResponseRequest with validated edited values and accessToken', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('Updated flood situation assistance notes');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    expect(updateResidentResponseRequest).toHaveBeenCalledOnce();
    expect(updateResidentResponseRequest).toHaveBeenCalledWith(
      mockNewRequest.id,
      expect.objectContaining({
        assistanceType: 'MEDICAL_ASSISTANCE',
        description: 'Updated flood situation assistance notes',
        affectedPeople: 4,
        injuredPeople: 1,
        medicalNeeds: true,
        roadAccessibility: 'LIMITED',
        location: {
          type: 'Point',
          coordinates: [79.900895, 6.726430]
        }
      }),
      'resident-token'
    );
  });

  it('2. Payload strictly whitelists only allowed fields and never sends database/lifecycle metadata', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    expect(updateResidentResponseRequest).toHaveBeenCalledOnce();
    const sentPayload = vi.mocked(updateResidentResponseRequest).mock.calls[0][1];
    const allowedKeys = [
      'assistanceType',
      'location',
      'affectedPeople',
      'medicalNeeds',
      'injuredPeople',
      'vulnerablePeople',
      'roadAccessibility',
      'contact',
      'description',
      'specialRequirements'
    ];
    const sentKeys = Object.keys(sentPayload);
    for (const key of sentKeys) {
      expect(allowedKeys).toContain(key);
    }
    // Explicitly verify forbidden fields are absent
    expect(sentPayload).not.toHaveProperty('id');
    expect(sentPayload).not.toHaveProperty('residentId');
    expect(sentPayload).not.toHaveProperty('status');
    expect(sentPayload).not.toHaveProperty('assignedResponderId');
    expect(sentPayload).not.toHaveProperty('declinedByResponderIds');
    expect(sentPayload).not.toHaveProperty('createdAt');
    expect(sentPayload).not.toHaveProperty('updatedAt');
  });

  it('3. Successful update navigates to request details via router.replace', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    expect(navigation.replace).toHaveBeenCalledWith({
      pathname: '/resident/emergency-request/[requestId]',
      params: { requestId: mockNewRequest.id, refreshed: 'true', updated: 'true' }
    });
  });

  it('4. Duplicate click protection: rapid double-tap calls updateResidentResponseRequest only once', async () => {
    let resolveApi: (value: { responseRequest: SafeResponseRequest }) => void = () => undefined;
    const pendingPromise = new Promise<{ responseRequest: SafeResponseRequest }>((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(updateResidentResponseRequest).mockReturnValue(pendingPromise);

    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    // First click initiates submission
    const firstCall = (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();
    // Immediate second click while in-flight
    const secondCall = (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    expect(updateResidentResponseRequest).toHaveBeenCalledTimes(1);

    // Resolve in-flight request
    resolveApi({ responseRequest: mockNewRequest });
    await firstCall;
    await secondCall;
  });

  it('5. In-flight submission disables action buttons and displays saving indicator', async () => {
    let resolveApi: (value: { responseRequest: SafeResponseRequest }) => void = () => undefined;
    const pendingPromise = new Promise<{ responseRequest: SafeResponseRequest }>((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(updateResidentResponseRequest).mockReturnValue(pendingPromise);

    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    void (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    // While saving is active
    const screenDuringSave = renderScreen();
    const text = extractScreenText(screenDuringSave);
    expect(text).toContain('Saving changes...');

    const backButton = findByAccessibilityLabel(screenDuringSave, 'Back to Edit');
    expect(backButton?.props.disabled).toBe(true);

    const savingConfirmButton = findByAccessibilityLabel(screenDuringSave, 'Confirm Changes');
    expect(savingConfirmButton?.props.disabled).toBe(true);

    // Clean up pending promise
    resolveApi({ responseRequest: mockNewRequest });
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalled();
    });
  });

  it('6. Lifecycle / Concurrency conflict (409) displays error and prevents stale overwrite', async () => {
    vi.mocked(updateResidentResponseRequest).mockRejectedValueOnce(
      new ApiClientError(409, 'INVALID_EDIT_STATUS', 'This request can no longer be edited because its status has changed.')
    );

    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    // Rerender screen after error state update
    const screenAfterConflict = renderScreen();
    const text = extractScreenText(screenAfterConflict);
    expect(text).toContain('This request can no longer be edited because its status has changed.');

    // Confirm Changes is disabled to prevent stale overwrites
    const disabledConfirm = findByAccessibilityLabel(screenAfterConflict, 'Confirm Changes');
    expect(disabledConfirm?.props.disabled).toBe(true);

    // View Details button is offered
    const viewDetailsButton = findByAccessibilityLabel(screenAfterConflict, 'View latest request details');
    expect(viewDetailsButton).toBeDefined();
    (viewDetailsButton?.props.onPress ?? viewDetailsButton?.props.onClick)?.();
    expect(navigation.back).toHaveBeenCalled();
  });

  it('7. Validation error (400) preserves form state and allows returning to edit', async () => {
    vi.mocked(updateResidentResponseRequest).mockRejectedValueOnce(
      new ApiClientError(400, 'VALIDATION_ERROR', 'Injured people cannot exceed total affected people.')
    );

    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    const screenAfterError = renderScreen();
    expect(extractScreenText(screenAfterError)).toContain('Injured people cannot exceed total affected people.');

    // Resident can tap Back to Edit to fix values without losing data
    const backToEdit = findByAccessibilityLabel(screenAfterError, 'Back to Edit');
    (backToEdit?.props.onPress ?? backToEdit?.props.onClick)?.();

    const editScreen = renderScreen();
    expect(extractScreenText(editScreen)).toContain('Edit Emergency Assistance Request');
    const descInput = findByAccessibilityLabel(editScreen, 'Short emergency description');
    expect(descInput?.props.value).toBe(mockNewRequest.description);
  });

  it('8. Server error (500) preserves edits and allows retry', async () => {
    vi.mocked(updateResidentResponseRequest).mockRejectedValueOnce(
      new ApiClientError(500, 'SERVER_ERROR', 'Internal server error')
    );

    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    const screenAfter500 = renderScreen();
    expect(extractScreenText(screenAfter500)).toContain(
      "We couldn't update your request. Check your connection and try again."
    );

    // Button is not disabled for non-conflict errors, allowing retry
    const retryConfirm = findByAccessibilityLabel(screenAfter500, 'Confirm Changes');
    expect(retryConfirm?.props.disabled).toBe(false);

    // Retry succeeds
    vi.mocked(updateResidentResponseRequest).mockResolvedValueOnce({ responseRequest: mockNewRequest });
    await (retryConfirm?.props.onPress ?? retryConfirm?.props.onClick)?.();
    expect(navigation.replace).toHaveBeenCalled();
  });

  it('9. Missing authentication displays session error without calling endpoint', async () => {
    auth.accessToken = null;
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    expect(updateResidentResponseRequest).not.toHaveBeenCalled();
    expect(extractScreenText(renderScreen())).toContain(
      'Your resident session is unavailable. Please log in again.'
    );
  });

  it('10. Standalone ResidentEmergencyRequestReviewView handles isSubmitting, error, and conflict states', () => {
    const form = mapRequestToEditForm(mockNewRequest);
    const onBackToEdit = vi.fn();
    const onConfirmChanges = vi.fn();
    const onViewDetails = vi.fn();

    // 10a: Loading state
    const submittingView = ResidentEmergencyRequestReviewView({
      form,
      onBackToEdit,
      onConfirmChanges,
      isSubmitting: true
    });
    expect(extractScreenText(submittingView)).toContain('Saving changes...');
    const backBtn = findByAccessibilityLabel(submittingView, 'Back to Edit');
    expect(backBtn?.props.disabled).toBe(true);
    const confirmBtn = findByAccessibilityLabel(submittingView, 'Confirm Changes');
    expect(confirmBtn?.props.disabled).toBe(true);

    // 10b: Conflict error state
    const conflictView = ResidentEmergencyRequestReviewView({
      form,
      onBackToEdit,
      onConfirmChanges,
      isConflictError: true,
      submitError: 'This request can no longer be edited because its status has changed.',
      onViewDetails
    });
    expect(extractScreenText(conflictView)).toContain(
      'This request can no longer be edited because its status has changed.'
    );
    const viewDetails = findByAccessibilityLabel(conflictView, 'View latest request details');
    (viewDetails?.props.onPress ?? viewDetails?.props.onClick)?.();
    expect(onViewDetails).toHaveBeenCalledOnce();
  });
});

describe('LDFEW-346: Refresh Resident Request Details after update', () => {
  const updatedRequest: SafeResponseRequest = {
    ...mockNewRequest,
    affectedPeople: 5,
    injuredPeople: 2,
    assistanceType: 'FLOOD_ASSISTANCE',
    roadAccessibility: 'ACCESSIBLE',
    description: 'Flooding reached ground floor, food spoiled and need clean water.',
    specialRequirements: 'Baby food and blankets required.',
    contact: {
      name: 'Nimal Perera',
      email: 'nimal@example.test',
      phoneNumber: '0779998888'
    },
    updatedAt: '2026-09-29T10:00:00.000Z'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    navigation.canGoBack.mockReturnValue(true);
    auth.accessToken = 'resident-token';
  });

  it('1. Confirm Changes succeeds -> router navigates to Request Details with refreshed: true -> Details screen refetches and displays updated backend values', async () => {
    // Stage 1: Edit screen loads the initial request
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    // Resident advances to Review Changes
    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    // Resident clicks Confirm Changes
    vi.mocked(updateResidentResponseRequest).mockResolvedValueOnce({ responseRequest: updatedRequest });
    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    // Navigation replaced with refreshed: 'true' and updated: 'true' parameters
    expect(navigation.replace).toHaveBeenCalledWith({
      pathname: '/resident/emergency-request/[requestId]',
      params: { requestId: mockNewRequest.id, refreshed: 'true', updated: 'true' }
    });

    // Stage 2: Details screen is mounted with the refreshed route parameter
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id, refreshed: 'true', updated: 'true' };
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: updatedRequest });

    renderDetailsScreen();
    // Initially shows loading state while refetching
    expect(extractScreenText(renderDetailsScreen())).toContain('Loading your emergency request details');

    // Trigger focus / mount refetch
    lifecycle.effect?.();

    // Authoritative fetch happens from getMyResponseRequestById with token
    await vi.waitFor(() => {
      const text = extractScreenText(renderDetailsScreen());
      expect(text).toContain('People needing assistance 5');
    });

    const detailsText = extractScreenText(renderDetailsScreen());
    // Directly verifies success message displayed on Request Details
    expect(detailsText).toContain('Request updated successfully.');
    // Directly verifies updated fields: injuredPeople updated from 1 to 2
    expect(detailsText).toContain('Injured people 2');
    expect(detailsText).toContain('Flood Assistance');
    expect(detailsText).toContain('Road access Accessible');
    expect(detailsText).toContain('Flooding reached ground floor, food spoiled and need clean water.');
    expect(detailsText).toContain('Baby food and blankets required.');
    expect(detailsText).toContain('0779998888');

    // Does NOT display pre-edit values
    expect(detailsText).not.toContain('Injured people 1');
    expect(detailsText).not.toContain('Oxygen cylinder needed');

    // Verified authentic endpoint read
    expect(getMyResponseRequestById).toHaveBeenCalledWith(mockNewRequest.id, 'resident-token');
  });

  it('2. App reload or direct deep-link fetches the persisted MongoDB state without relying on route params or stale client state', async () => {
    // Direct link to the details screen with clean state (simulating fresh page load / reload)
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: updatedRequest });

    renderDetailsScreen();
    lifecycle.effect?.();

    await vi.waitFor(() => {
      expect(extractScreenText(renderDetailsScreen())).toContain('Injured people 2');
    });

    const text = extractScreenText(renderDetailsScreen());
    expect(text).toContain('People needing assistance 5');
    expect(text).toContain('Flood Assistance');
    expect(text).toContain('Flooding reached ground floor, food spoiled and need clean water.');
    expect(getMyResponseRequestById).toHaveBeenCalledExactlyOnceWith(mockNewRequest.id, 'resident-token');
  });

  it('3. Refresh failure on Request Details handles API errors gracefully with error panel and retry action', async () => {
    // Simulating returning from edit when network drops or backend encounters 500 error
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id, refreshed: 'true' };
    vi.mocked(getMyResponseRequestById).mockRejectedValueOnce(
      new ApiClientError(500, 'SERVER_ERROR', 'Database temporarily unavailable')
    );

    renderDetailsScreen();
    lifecycle.effect?.();

    await vi.waitFor(() => {
      expect(extractScreenText(renderDetailsScreen())).toContain('Unable to load request details');
    });

    const errorText = extractScreenText(renderDetailsScreen());
    expect(errorText).toContain('Unable to load your emergency request details right now.');
    // Must NOT display stale request data or crash
    expect(errorText).not.toContain('Injured people');
    expect(errorText).not.toContain('Database temporarily unavailable');

    // Retry button is available
    const retryButton = findByAccessibilityLabel(renderDetailsScreen(), 'Refresh emergency request details');
    expect(retryButton).toBeDefined();

    // When backend recovers, retry restores the updated details
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: updatedRequest });
    (retryButton?.props.onPress ?? retryButton?.props.onClick)?.();

    await vi.waitFor(() => {
      expect(extractScreenText(renderDetailsScreen())).toContain('Injured people 2');
    });
    expect(extractScreenText(renderDetailsScreen())).toContain('People needing assistance 5');
  });

  it('4. Re-editing immediately after update pre-fills the edit form with newly saved values', async () => {
    // 1. Details screen loads updated request
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: updatedRequest });

    renderDetailsScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(extractScreenText(renderDetailsScreen())).toContain('Injured people 2');
    });

    // Edit button is enabled for NEW status
    const editBtn = findByAccessibilityLabel(renderDetailsScreen(), 'Edit Request');
    expect(editBtn).toBeDefined();
    expect(editBtn?.props.disabled).toBe(false);

    // Resident clicks Edit Request
    (editBtn?.props.onPress ?? editBtn?.props.onClick)?.();
    expect(navigation.push).toHaveBeenCalledWith({
      pathname: '/resident/emergency-request/[requestId]/edit',
      params: { requestId: mockNewRequest.id }
    });

    // 2. Edit Screen mounts and fetches the latest data from the backend
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: updatedRequest });

    renderScreen();
    lifecycle.effect?.();

    await vi.waitFor(() => {
      expect(extractScreenText(renderScreen())).toContain('Edit Emergency Assistance Request');
    });

    // Form is pre-filled with the NEW values (not original values)
    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    expect(descInput?.props.value).toBe(updatedRequest.description);
    const specInput = findByAccessibilityLabel(renderScreen(), 'Special requirements');
    expect(specInput?.props.value).toBe(updatedRequest.specialRequirements);
    expect(extractScreenText(renderScreen())).toContain('Flood Assistance');
  });

  it('5. Manual Refresh button in Details header fetches fresh data', async () => {
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: mockNewRequest });

    renderDetailsScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(extractScreenText(renderDetailsScreen())).toContain('Injured people 1');
    });

    // Another update occurs on backend; Resident taps Refresh
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: updatedRequest });
    const refreshButton = findByAccessibilityLabel(renderDetailsScreen(), 'Refresh emergency request details');
    (refreshButton?.props.onPress ?? refreshButton?.props.onClick)?.();

    await vi.waitFor(() => {
      expect(extractScreenText(renderDetailsScreen())).toContain('Injured people 2');
    });
    expect(getMyResponseRequestById).toHaveBeenCalledTimes(2);
  });
});

describe('LDFEW-347: Add success, loading and error handling', () => {
  const updatedRequest: SafeResponseRequest = {
    ...mockNewRequest,
    affectedPeople: 5,
    injuredPeople: 2,
    assistanceType: 'FLOOD_ASSISTANCE',
    roadAccessibility: 'ACCESSIBLE',
    description: 'Flooding reached ground floor, food spoiled and need clean water.',
    specialRequirements: 'Baby food and blankets required.',
    contact: {
      name: 'Nimal Perera',
      email: 'nimal@example.test',
      phoneNumber: '0779998888'
    },
    updatedAt: '2026-09-29T10:00:00.000Z'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    navigation.canGoBack.mockReturnValue(true);
    auth.accessToken = 'resident-token';
  });

  it('1. Confirm Changes enters saving/loading state and disables action buttons while in flight', async () => {
    let resolveApi: (value: { responseRequest: SafeResponseRequest }) => void = () => undefined;
    const pendingPromise = new Promise<{ responseRequest: SafeResponseRequest }>((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(updateResidentResponseRequest).mockReturnValue(pendingPromise);

    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    const submitPromise = (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    const inFlightScreen = renderScreen();
    // 1. Confirm Changes enters saving/loading state with friendly text "Saving changes..."
    expect(extractScreenText(inFlightScreen)).toContain('Saving changes...');

    // 2. Action buttons are disabled while saving
    const inFlightConfirm = findByAccessibilityLabel(inFlightScreen, 'Confirm Changes');
    expect(inFlightConfirm?.props.disabled).toBe(true);
    const inFlightBack = findByAccessibilityLabel(inFlightScreen, 'Back to Edit');
    expect(inFlightBack?.props.disabled).toBe(true);

    // Complete saving
    resolveApi({ responseRequest: updatedRequest });
    await submitPromise;
  });

  it('2. Multiple rapid taps on Confirm Changes result in only ONE update request', async () => {
    let resolveApi: (value: { responseRequest: SafeResponseRequest }) => void = () => undefined;
    const pendingPromise = new Promise<{ responseRequest: SafeResponseRequest }>((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(updateResidentResponseRequest).mockReturnValue(pendingPromise);

    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    // First tap initiates update
    const firstTap = (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();
    // Immediate rapid subsequent taps while in flight
    const secondTap = (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();
    const thirdTap = (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    // 3. Mutex guard ensures only one update dispatch occurs
    expect(updateResidentResponseRequest).toHaveBeenCalledTimes(1);

    resolveApi({ responseRequest: updatedRequest });
    await firstTap;
    await secondTap;
    await thirdTap;
  });

  it('3. Successful update shows success message and navigates to refreshed Request Details', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    vi.mocked(updateResidentResponseRequest).mockResolvedValueOnce({ responseRequest: updatedRequest });
    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    // 4 & 5. Navigation replaced with refreshed: true and updated: true flags
    expect(navigation.replace).toHaveBeenCalledWith({
      pathname: '/resident/emergency-request/[requestId]',
      params: { requestId: mockNewRequest.id, refreshed: 'true', updated: 'true' }
    });

    // Render Request Details with returned flags
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id, refreshed: 'true', updated: 'true' };
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: updatedRequest });

    renderDetailsScreen();
    lifecycle.effect?.();

    await vi.waitFor(() => {
      expect(extractScreenText(renderDetailsScreen())).toContain('Request updated successfully.');
    });

    const detailsText = extractScreenText(renderDetailsScreen());
    expect(detailsText).toContain('Request updated successfully.');
    expect(detailsText).toContain('Injured people 2');
    expect(detailsText).toContain('Flood Assistance');
  });

  it('4. Validation failure keeps entered values, shows friendly error, and prevents update submission', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Short emergency description')).toBeDefined();
    });

    // Enter invalid whitespace description
    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('   ');

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    // 6. Validation error prevents proceeding or submitting
    expect(updateResidentResponseRequest).not.toHaveBeenCalled();
    const screen = renderScreen();
    expect(extractScreenText(screen)).toContain('Describe the emergency.');
    expect(extractScreenText(screen)).toContain('Please correct the highlighted fields before continuing.');
  });

  it('5. Network/server failure shows friendly message, preserves in-memory edits, and re-enables Confirm Changes for retry', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    // 7. Network drop occurs (status 0 / NETWORK_ERROR)
    vi.mocked(updateResidentResponseRequest).mockRejectedValueOnce(
      new ApiClientError(0, 'NETWORK_ERROR', 'Network connection dropped')
    );

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    const screenAfterNetworkError = renderScreen();
    const errorText = extractScreenText(screenAfterNetworkError);
    // User-friendly plain wording without technical stack traces
    expect(errorText).toContain("We couldn't update your request. Check your connection and try again.");
    expect(errorText).not.toContain('Network connection dropped');
    expect(errorText).not.toContain('NETWORK_ERROR');

    // 8 & 9. Edits are preserved and Confirm Changes is re-enabled for retry
    const retryConfirm = findByAccessibilityLabel(screenAfterNetworkError, 'Confirm Changes');
    expect(retryConfirm?.props.disabled).toBe(false);

    // Can return to edit without losing changes
    const backToEdit = findByAccessibilityLabel(screenAfterNetworkError, 'Back to Edit');
    (backToEdit?.props.onPress ?? backToEdit?.props.onClick)?.();

    const editScreen = renderScreen();
    expect(extractScreenText(editScreen)).toContain('Edit Emergency Assistance Request');
    const preservedDesc = findByAccessibilityLabel(editScreen, 'Short emergency description');
    expect(preservedDesc?.props.value).toBe(mockNewRequest.description);

    // Proceed to review and retry successfully
    (findByAccessibilityLabel(editScreen, 'Review Changes')?.props.onPress ?? findByAccessibilityLabel(editScreen, 'Review Changes')?.props.onClick)?.();
    vi.mocked(updateResidentResponseRequest).mockResolvedValueOnce({ responseRequest: updatedRequest });
    const retryButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (retryButton?.props.onPress ?? retryButton?.props.onClick)?.();

    expect(navigation.replace).toHaveBeenCalledWith({
      pathname: '/resident/emergency-request/[requestId]',
      params: { requestId: mockNewRequest.id, refreshed: 'true', updated: 'true' }
    });
  });

  it('6. Lifecycle conflict (409) displays friendly message, prevents stale overwrite, and refreshes server status where edit capability disappears', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Review Changes')).toBeDefined();
    });

    const reviewButton = findByAccessibilityLabel(renderScreen(), 'Review Changes');
    (reviewButton?.props.onPress ?? reviewButton?.props.onClick)?.();

    // 10. Lifecycle race condition: responder accepted request while editing, backend returns 409
    vi.mocked(updateResidentResponseRequest).mockRejectedValueOnce(
      new ApiClientError(409, 'STATUS_CONFLICT', 'Request has been assigned to responder')
    );

    const confirmButton = findByAccessibilityLabel(renderScreen(), 'Confirm Changes');
    await (confirmButton?.props.onPress ?? confirmButton?.props.onClick)?.();

    const conflictScreen = renderScreen();
    const conflictText = extractScreenText(conflictScreen);
    expect(conflictText).toContain('This request can no longer be edited because its status has changed.');
    expect(conflictText).not.toContain('STATUS_CONFLICT');

    // Confirm Changes is disabled to prevent stale overwrites
    const disabledConfirm = findByAccessibilityLabel(conflictScreen, 'Confirm Changes');
    expect(disabledConfirm?.props.disabled).toBe(true);

    // View latest request details button is available
    const viewDetailsButton = findByAccessibilityLabel(conflictScreen, 'View latest request details');
    expect(viewDetailsButton).toBeDefined();

    // 11 & 12. Tap View Request Details -> returns to Request Details and refetches server state
    (viewDetailsButton?.props.onPress ?? viewDetailsButton?.props.onClick)?.();
    expect(navigation.back).toHaveBeenCalled();

    // Details screen renders the accepted/assigned request returned by backend
    const assignedRequest: SafeResponseRequest = {
      ...mockNewRequest,
      status: 'ASSIGNED',
      assignedResponderId: 'responder-1'
    };
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id, refreshed: 'true' };
    vi.mocked(getMyResponseRequestById).mockResolvedValueOnce({ responseRequest: assignedRequest });

    renderDetailsScreen();
    lifecycle.effect?.();

    await vi.waitFor(() => {
      expect(extractScreenText(renderDetailsScreen())).toContain('Status:  Assigned');
    });

    const refreshedDetailsText = extractScreenText(renderDetailsScreen());
    expect(refreshedDetailsText).toContain('Status:  Assigned');
    // Edit action is no longer available when the lifecycle rules say editing is not allowed
    expect(findByAccessibilityLabel(renderDetailsScreen(), 'Edit Request')).toBeNull();
    expect(refreshedDetailsText).toContain('This request can no longer be edited because an Emergency Responder has already accepted it.');
  });
});

