import * as React from 'react';
import type { SafeResponseRequest, UserRole } from '@safealert/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MyEmergencyRequestsRoute from '../../../../../app/resident/my-emergency-requests';
import ResidentLayout from '../../../../../app/resident/_layout';
import { RoleRouteLayout } from '../../../auth/screens/RoleRouteLayout';
import { listMyResponseRequests } from '../api/responseRequestApi';
import { EmergencyRequestSummaryCard } from '../components/EmergencyRequestSummaryCard';
import { formatResidentReportDateTime } from '../reports';
import { EmergencyAssistanceDraftProvider, useEmergencyAssistanceDraft } from '../emergencyAssistanceDraft';
import { residentBottomNavItems, residentPrimaryActions } from '../mockData';
import { EmergencyAssistanceScreen } from './EmergencyAssistanceScreen';
import { EmergencyRequestSubmittedScreen } from './EmergencyRequestSubmittedScreen';
import { MyEmergencyRequestsScreen } from './MyEmergencyRequestsScreen';

// Follow the existing mobile tests: exercise screen callbacks without a native runtime.
const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  effect: (() => undefined) as () => (() => void) | undefined
}));
const navigation = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), canGoBack: vi.fn() }));
const auth = vi.hoisted(() => ({
  accessToken: 'resident-token' as string | null,
  status: 'authenticated', user: { id: 'resident-1', role: 'RESIDENT' as UserRole }
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (callback: typeof lifecycle.effect) => { lifecycle.effect = callback; },
  useState: (initial: unknown) => {
    const index = lifecycle.cursor++;
    if (!(index in lifecycle.slots)) lifecycle.slots[index] = initial;
    return [lifecycle.slots[index], (value: unknown) => { lifecycle.slots[index] = value; }];
  }
}));
vi.mock('expo-router', () => ({ useRouter: () => navigation, Redirect: 'redirect', Stack: 'stack' }));
vi.mock('react-native', () => ({
  ActivityIndicator: 'span', Pressable: 'button', Text: 'span', View: 'div', TextInput: 'input',
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../../auth/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/components/DashboardScreen', () => ({
  DashboardScreen: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('../../shared/currentLocation', () => ({ captureCurrentLocation: vi.fn(), formatCoordinate: vi.fn() }));
vi.mock('../api/responseRequestApi', () => ({ listMyResponseRequests: vi.fn() }));
vi.mock('../reportDraft', () => ({ ReportHazardDraftProvider: 'report-provider' }));
vi.mock('../emergencyAssistanceDraft', async (importOriginal) => ({
  ...await importOriginal<typeof import('../emergencyAssistanceDraft')>(),
  useEmergencyAssistanceDraft: vi.fn()
}));

const request: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011', residentId: 'resident-1', status: 'NEW',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 1, medicalNeeds: true, injuredPeople: 1,
  vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'ACCESSIBLE', contact: { name: 'Resident', phoneNumber: '+94-77-555-1234' },
  description: 'Medical assistance needed.',
  createdAt: '2026-09-24T10:00:00.000Z', updatedAt: '2026-09-24T10:00:00.000Z'
};

function render() {
  lifecycle.cursor = 0;
  return MyEmergencyRequestsScreen();
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

function summaryCards(node: React.ReactNode): React.ReactElement<{ request: SafeResponseRequest }>[] {
  if (Array.isArray(node)) return node.flatMap(summaryCards);
  if (!React.isValidElement<{ children?: React.ReactNode; request: SafeResponseRequest }>(node)) return [];
  return node.type === EmergencyRequestSummaryCard ? [node] : summaryCards(node.props.children);
}

function press(node: React.ReactNode, label: string): boolean {
  if (Array.isArray(node)) return node.some((child) => press(child, label));
  if (!React.isValidElement<{ children?: React.ReactNode; accessibilityLabel?: string; onPress?: () => void }>(node)) return false;
  if (node.props.onPress && (node.props.accessibilityLabel === label || screenText(node.props.children) === label)) {
    node.props.onPress();
    return true;
  }
  return press(node.props.children, label);
}

beforeEach(() => {
  vi.clearAllMocks();
  lifecycle.slots = [];
  lifecycle.cursor = 0;
  auth.accessToken = 'resident-token';
  auth.status = 'authenticated';
  auth.user.role = 'RESIDENT';
  navigation.canGoBack.mockReturnValue(true);
  vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [] });
  // Read the existing provider's initial draft so navigation tests don't duplicate form defaults.
  const provider = EmergencyAssistanceDraftProvider({ children: null });
  vi.mocked(useEmergencyAssistanceDraft).mockReturnValue(provider.props.value);
  lifecycle.slots = [];
  lifecycle.cursor = 0;
});

describe('My Emergency Requests foundation', () => {
  it('renders the dedicated screen and loads through the resident service', async () => {
    expect(MyEmergencyRequestsRoute().type).toBe(MyEmergencyRequestsScreen);
    expect(screenText(render())).toContain('My Emergency Requests');
    expect(screenText(render())).toContain('Track the progress of your emergency assistance requests.');
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('You have no emergency assistance requests yet.'));
    expect(listMyResponseRequests).toHaveBeenCalledExactlyOnceWith('resident-token');
  });

  it('renders one summary card from the existing authenticated service', async () => {
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [request] });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('1 emergency assistance request submitted.'));
    const cards = summaryCards(render());
    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe(request.id);
    expect(cards[0].props.request).toBe(request);
    expect(screenText(cards[0])).toContain('Medical Assistance');
    expect(screenText(cards[0])).toContain(`Submitted:  ${formatResidentReportDateTime(request.createdAt)}`);
    expect(screenText(cards[0])).toContain('Status:  Submitted');
    expect(screenText(cards[0])).not.toContain(request.createdAt);
    expect(listMyResponseRequests).toHaveBeenCalledExactlyOnceWith('resident-token');
  });

  it('renders multiple requests in API order with readable status labels', async () => {
    const requests: SafeResponseRequest[] = [
      { ...request, id: 'in-progress', status: 'IN_PROGRESS', assistanceType: 'RESCUE_EVACUATION' },
      { ...request, id: 'completed', status: 'COMPLETED', createdAt: '2026-09-20T10:00:00.000Z' },
      { ...request, id: 'assigned', status: 'ASSIGNED' },
      { ...request, id: 'dispatched', status: 'DISPATCHED' },
      { ...request, id: 'arrived', status: 'ARRIVED' }
    ];
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: requests });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(summaryCards(render())).toHaveLength(requests.length));
    const cards = summaryCards(render());
    expect(cards.map((card) => card.props.request.id)).toEqual(requests.map((item) => item.id));
    expect(cards.map((card) => screenText(card).split('Status:  ')[1])).toEqual([
      'In Progress', 'Completed', 'Assigned', 'Dispatched', 'Arrived'
    ]);
    expect(screenText(cards[0])).toContain('Rescue / Evacuation');
    expect(screenText(render())).not.toContain('IN_PROGRESS');
  });

  it('keeps incomplete summaries readable with unique fallback keys and no fake action', async () => {
    const incomplete = { ...request, id: undefined, status: 'UNKNOWN', assistanceType: null, createdAt: null } as unknown as SafeResponseRequest;
    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [incomplete, incomplete] });
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(summaryCards(render())).toHaveLength(2));
    const cards = summaryCards(render());
    expect(new Set(cards.map((card) => card.key)).size).toBe(2);
    const card = EmergencyRequestSummaryCard(cards[0].props);
    expect(card.props.accessibilityLabel).toBe('Emergency Assistance. Submitted: Not available. Status: Status unavailable.');
    expect(card.props.accessible).toBe(true);
    expect(screenText(card)).not.toContain('UNKNOWN');
    expect(press(card, 'View Details')).toBe(false);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each([null, request])('routes confirmation tracking without request parameters (submission: %j)', (submittedResponseRequest) => {
    vi.mocked(useEmergencyAssistanceDraft).mockReturnValue({
      ...useEmergencyAssistanceDraft(), submittedResponseRequest
    });
    expect(press(EmergencyRequestSubmittedScreen(), 'Track emergency request')).toBe(true);
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/resident/my-emergency-requests');
  });

  it('provides a tracking entry from Help without submitting another request', () => {
    expect(press(EmergencyAssistanceScreen(), 'My Emergency Requests')).toBe(true);
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/resident/my-emergency-requests');
    expect(residentPrimaryActions.find((action) => action.title === 'Help / Emergency Assistance')?.href).toBe('/resident/help');
  });

  it('preserves the existing hazard report navigation', () => {
    expect(residentBottomNavItems.find((item) => item.label === 'Reports')?.href).toBe('/resident/reports');
    expect(residentPrimaryActions.find((item) => item.title === 'Report Status & Reviews')?.href).toBe('/resident/reports');
  });

  it('returns to the previous screen when history exists', () => {
    expect(press(render(), 'Go back')).toBe(true);
    expect(navigation.back).toHaveBeenCalledOnce();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('returns direct entries without history to Help', () => {
    navigation.canGoBack.mockReturnValue(false);
    press(render(), 'Go back');
    expect(navigation.replace).toHaveBeenCalledWith('/resident/help');
    expect(navigation.back).not.toHaveBeenCalled();
  });

  it('inherits the existing Resident-only layout', () => {
    const guard = ResidentLayout().props.children.props.children;
    expect(guard.type).toBe(RoleRouteLayout);
    expect(guard.props.allowedRole).toBe('RESIDENT');
    expect(RoleRouteLayout(guard.props).type).toBe('stack');
    auth.status = 'unauthenticated';
    expect(RoleRouteLayout(guard.props).props.href).toBe('/auth/login');
    auth.status = 'authenticated';
    auth.user.role = 'EMERGENCY_RESPONDER';
    expect(RoleRouteLayout(guard.props).props.href).toBe('/responder');
  });

  it('does not fetch without authentication', () => {
    auth.accessToken = null;
    expect(screenText(render())).toContain('Please log in again.');
    lifecycle.effect();
    expect(listMyResponseRequests).not.toHaveBeenCalled();
  });

  it('shows a safe message instead of technical backend errors', async () => {
    vi.mocked(listMyResponseRequests).mockRejectedValue(new Error('Database connection details'));
    render();
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('Unable to load your emergency requests right now.'));
    expect(screenText(render())).not.toContain('Database');
  });

  it('ignores a response after cleanup and hides previous session data', async () => {
    let resolve!: (value: { responseRequests: SafeResponseRequest[] }) => void;
    vi.mocked(listMyResponseRequests).mockReturnValue(new Promise((done) => { resolve = done; }));
    render();
    const cleanup = lifecycle.effect();
    cleanup?.();
    resolve({ responseRequests: [] });
    await Promise.resolve();
    expect(screenText(render())).toContain('Loading your emergency requests');

    vi.mocked(listMyResponseRequests).mockResolvedValue({ responseRequests: [] });
    lifecycle.effect();
    await vi.waitFor(() => expect(screenText(render())).toContain('You have no emergency assistance requests yet.'));
    auth.accessToken = 'another-session-token';
    expect(screenText(render())).toContain('Loading your emergency requests');
  });
});
