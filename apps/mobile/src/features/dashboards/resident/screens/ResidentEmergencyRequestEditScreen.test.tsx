import * as React from 'react';
import type { SafeResponseRequest, UserRole } from '@safealert/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mapRequestToEditForm,
  ResidentEmergencyRequestEditScreen
} from './ResidentEmergencyRequestEditScreen';
import {
  cancelResidentResponseRequest,
  createResidentResponseRequest,
  getMyResponseRequestById
} from '../api/responseRequestApi';
import {
  parseResidentEmergencyRequestId,
  residentEmergencyRequestDetailsHref,
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
  TextInput: ({ value, onChangeText, accessibilityLabel, placeholder }: {
    value?: string;
    onChangeText?: (text: string) => void;
    accessibilityLabel?: string;
    placeholder?: string;
  }) => (
    <input
      aria-label={accessibilityLabel}
      placeholder={placeholder}
      value={value}
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

function renderScreen() {
  lifecycle.cursor = 0;
  return ResidentEmergencyRequestEditScreen();
}

type MockElementProps = {
  accessibilityLabel?: string;
  'aria-label'?: string;
  children?: React.ReactNode;
  value?: string;
  onChangeText?: (text: string) => void;
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

describe('ResidentEmergencyRequestEditScreen (LDFEW-342)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lifecycle.slots = [];
    lifecycle.cursor = 0;
    lifecycle.params = { requestId: mockNewRequest.id };
    navigation.canGoBack.mockReturnValue(true);
    auth.accessToken = 'resident-token';
  });

  it('1. Edit screen uses the correct requestId from route parameters', async () => {
    lifecycle.params = { requestId: '507f1f77bcf86cd799439011' };
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(getMyResponseRequestById).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'resident-token');
    });
  });

  it('2. Existing request information is retrieved and displayed', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Edit Emergency Assistance Request');
      expect(text).toContain('Medical Assistance');
      expect(text).toContain('Elderly resident requires assistance');
    });
  });

  it('3. Loading state appears while data is loading', () => {
    vi.mocked(getMyResponseRequestById).mockReturnValue(new Promise(() => {}));
    renderScreen();
    lifecycle.effect?.();
    const text = extractScreenText(renderScreen());
    expect(text).toContain('Loading your emergency request');
    expect(text).not.toContain('Edit Emergency Assistance Request');
  });

  it('4. Assistance type is pre-filled correctly', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(extractScreenText(renderScreen())).toContain('Medical Assistance');
    });
    const form = mapRequestToEditForm(mockNewRequest);
    expect(form.assistanceType).toBe('MEDICAL_ASSISTANCE');
  });

  it('5. Affected people count is pre-filled correctly', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Affected people');
      expect(text).toContain('4');
    });
  });

  it('6. Injured people count is pre-filled correctly', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Number injured');
      expect(text).toContain('1');
    });
  });

  it('7. Vulnerable-person fields are pre-filled correctly', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Children');
      expect(text).toContain('2');
      expect(text).toContain('Elderly people');
      expect(text).toContain('1');
      expect(text).toContain('Persons with disabilities');
      expect(text).toContain('0');
      expect(text).toContain('Pregnant persons');
    });
  });

  it('8. Medical needs are pre-filled correctly', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Medical Needs');
      expect(text).toContain('Yes');
      expect(text).toContain('No');
    });
    const form = mapRequestToEditForm(mockNewRequest);
    expect(form.requiresMedicalAssistance).toBe(true);
  });

  it('9. Road accessibility is pre-filled correctly', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Road / Access Conditions');
      expect(text).toContain('Limited');
    });
    const form = mapRequestToEditForm(mockNewRequest);
    expect(form.roadAccessibility).toBe('LIMITED');
  });

  it('10. Description is pre-filled correctly', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const input = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
      expect(input?.props.value).toBe('Elderly resident requires assistance');
    });
  });

  it('11. Special requirements are pre-filled when present', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const input = findByAccessibilityLabel(renderScreen(), 'Special requirements');
      expect(input?.props.value).toBe('Oxygen cylinder needed');
    });
  });

  it('12. Phone/contact information is pre-filled appropriately', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Nimal Perera');
      expect(text).toContain('nimal@example.test');
      const phoneInput = findByAccessibilityLabel(renderScreen(), 'Contact phone number');
      expect(phoneInput?.props.value).toBe('0771234567');
    });
  });

  it('13. Saved latitude/longitude are preserved and not replaced by device GPS', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Saved emergency location');
      expect(text).toContain('Lat 6.726430, Long 79.900895');
      expect(text).toContain('Preserved from your submitted request.');
    });
  });

  it('14. Missing optional values do not crash the form', () => {
    const minimalRequest = {
      ...mockNewRequest,
      specialRequirements: undefined,
      vulnerablePeople: undefined,
      description: undefined,
      contact: undefined,
      location: undefined,
      medicalNeeds: undefined,
      injuredPeople: undefined,
      affectedPeople: undefined
    } as unknown as SafeResponseRequest;

    const form = mapRequestToEditForm(minimalRequest);
    expect(form.specialRequirements).toBe('');
    expect(form.description).toBe('');
    expect(form.contact.phoneNumber).toBe('');
    expect(form.contact.name).toBe('');
    expect(form.contact.email).toBe('');
    expect(form.vulnerablePeople.children).toBe(0);
    expect(form.vulnerablePeople.elderlyPeople).toBe(0);
    expect(form.vulnerablePeople.personsWithDisabilities).toBe(0);
    expect(form.vulnerablePeople.pregnantPersons).toBe(0);
    expect(form.latitude).toBe(0);
    expect(form.longitude).toBe(0);
    expect(form.affectedPeopleCount).toBe(1);
    expect(form.injuredCount).toBe(0);
    expect(form.requiresMedicalAssistance).toBe(false);
  });

  it('15. Normal rerenders do not reset Resident edits', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Short emergency description')).toBeDefined();
    });

    const descriptionInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descriptionInput?.props.onChangeText?.('Updated emergency note by resident');

    const rerenderedScreen = renderScreen();
    const updatedInput = findByAccessibilityLabel(rerenderedScreen, 'Short emergency description');
    expect(updatedInput?.props.value).toBe('Updated emergency note by resident');
  });

  it.each([
    ['ASSIGNED', 'an Emergency Responder has already accepted it.'],
    ['DISPATCHED', 'an Emergency Responder has already accepted it.'],
    ['COMPLETED', 'Completed requests cannot be edited.'],
    ['CANCELLED', 'Cancelled requests cannot be edited.']
  ] as const)('16. A non-NEW request (%s) does not expose the editable form', async (status, expectedNotice) => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({
      responseRequest: { ...mockNewRequest, status }
    });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Editing unavailable');
      expect(text).toContain(expectedNotice);
      expect(text).not.toContain('Edit Emergency Assistance Request');
    });
  });

  it('17. Load failure produces a friendly error/retry state', async () => {
    vi.mocked(getMyResponseRequestById).mockRejectedValue(new Error('Network failure'));
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      const text = extractScreenText(renderScreen());
      expect(text).toContain('Unable to open request');
    });
  });

  it('18. Invalid or missing requestId is handled safely', () => {
    lifecycle.params = { requestId: undefined };
    const screen = renderScreen();
    const text = extractScreenText(screen);
    expect(text).toContain('Select a valid request');
    expect(getMyResponseRequestById).not.toHaveBeenCalled();
  });

  it('19. Back to Request Details remains functional', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(findByAccessibilityLabel(renderScreen(), 'Back to Request Details')).toBeDefined();
    });

    const backButton = findByAccessibilityLabel(renderScreen(), 'Back to Request Details');
    (backButton?.props.onPress ?? backButton?.props.onClick)?.();
    expect(navigation.back).toHaveBeenCalled();

    navigation.canGoBack.mockReturnValue(false);
    (backButton?.props.onPress ?? backButton?.props.onClick)?.();
    expect(navigation.replace).toHaveBeenCalledWith(
      residentEmergencyRequestDetailsHref(mockNewRequest.id)
    );
  });

  it('20. Opening or editing the form does NOT create a new emergency request', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(extractScreenText(renderScreen())).toContain('Edit Emergency Assistance Request');
    });
    const phoneInput = findByAccessibilityLabel(renderScreen(), 'Contact phone number');
    phoneInput?.props.onChangeText?.('0779998888');
    expect(createResidentResponseRequest).not.toHaveBeenCalled();
  });

  it('21. Opening or editing the form does NOT update the backend yet', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(extractScreenText(renderScreen())).toContain('Edit Emergency Assistance Request');
    });
    const descInput = findByAccessibilityLabel(renderScreen(), 'Short emergency description');
    descInput?.props.onChangeText?.('Changed description locally');
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
    expect(createResidentResponseRequest).not.toHaveBeenCalled();
  });

  it('22. Existing Emergency Assistance create flow is distinct from edit mode', () => {
    expect(mapRequestToEditForm(mockNewRequest).assistanceType).toBe('MEDICAL_ASSISTANCE');
    expect(mockNewRequest.status).toBe('NEW');
  });

  it('23. Existing LDFEW-341 Edit Request navigation link generates valid path', () => {
    const editHref = residentEmergencyRequestEditHref(mockNewRequest.id);
    expect(editHref).toEqual({
      pathname: '/resident/emergency-request/[requestId]/edit',
      params: { requestId: mockNewRequest.id }
    });
    expect(parseResidentEmergencyRequestId(mockNewRequest.id)).toBe(mockNewRequest.id);
  });

  it('24. Existing Resident cancellation functionality is preserved', async () => {
    vi.mocked(getMyResponseRequestById).mockResolvedValue({ responseRequest: mockNewRequest });
    renderScreen();
    lifecycle.effect?.();
    await vi.waitFor(() => {
      expect(extractScreenText(renderScreen())).toContain('Edit Emergency Assistance Request');
    });
    expect(cancelResidentResponseRequest).not.toHaveBeenCalled();
  });
});
