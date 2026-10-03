import * as React from 'react';
import { RESPONSE_STATUSES, type SafeResponseRequest, type SafeUser } from '@safealert/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponderAssignmentsScreen } from './ResponderAssignmentsScreen';
import { ResponderProfileScreen } from './ResponderProfileScreen';
import { listAssignedResponderRequests, listCompletedResponderRequests, listPendingResponderRequests } from '../api/responderRequestsApi';
import { initiateViewLocationRoute } from '../contactLocationUi';
import { clearResponderRequestCache, updateCachedResponderRequest } from '../requestDetailsCache';
import { LocationPreview } from '../../shared/maps/LocationPreview';
import type { QueuedResponderUpdate } from '../offline/responderUpdateQueue';
import type { ResponderAssignmentView } from '../requestDetails';
import ResponderActiveRoute from '../../../../../app/responder/active';
import ResponderMapRoute from '../../../../../app/responder/map';
import ResponderHistoryRoute from '../../../../../app/responder/history';
import ResponderProfileRoute from '../../../../../app/responder/profile';

const lifecycle = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, focus: (() => undefined) as () => (() => void) | undefined,
  effects: [] as (() => void | (() => void))[],
  focusCallbacks: [] as (() => (() => void) | undefined)[]
}));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const auth = vi.hoisted(() => ({
  accessToken: 'responder-token' as string | null,
  user: { id: 'responder-a', name: 'Responder Alice', email: 'alice@example.com', role: 'EMERGENCY_RESPONDER' } as SafeUser | null,
  logout: vi.fn()
}));
const offline = vi.hoisted(() => ({
  connectivity: 'online' as 'online' | 'offline' | 'unknown', items: [] as QueuedResponderUpdate[],
  status: 'ready' as 'ready' | 'loading' | 'error', error: null as string | null, syncStatus: 'idle' as 'idle' | 'success' | 'error' | 'paused',
  isCurrent: () => true, reload: vi.fn(), retrySync: vi.fn(), isSyncing: false,
  lastSyncedAt: null as string | null, syncError: null as string | null
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (callback: () => void | (() => void)) => { lifecycle.effects.push(callback); },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useRef: (initial: unknown) => {
    const index = lifecycle.cursor++;
    lifecycle.slots[index] ??= { current: initial };
    return lifecycle.slots[index];
  },
  useState: (initial: unknown) => {
    const index = lifecycle.cursor++;
    if (!(index in lifecycle.slots)) lifecycle.slots[index] = initial;
    return [lifecycle.slots[index], (value: unknown) => {
      lifecycle.slots[index] = typeof value === 'function' ? value(lifecycle.slots[index]) : value;
    }];
  }
}));
vi.mock('expo-router', () => ({ useFocusEffect: (callback: typeof lifecycle.focus) => { lifecycle.focus = callback; lifecycle.focusCallbacks.push(callback); }, useRouter: () => navigation }));
vi.mock('react-native', () => ({
  ActivityIndicator: 'progress', Pressable: 'button', Text: 'span', View: 'div',
  Linking: {}, Platform: { OS: 'ios' }, StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../shared/components/DashboardHeader', () => ({ DashboardHeader: ({ title, description }: { title: string; description?: string }) => `${title} ${description ?? ''}` }));
vi.mock('../../shared/components/DashboardScreen', () => ({ DashboardScreen: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../../shared/components/DashboardGlyph', () => ({ DashboardGlyph: () => null }));
vi.mock('../../shared/maps/LocationPreview', () => ({ LocationPreview: vi.fn(() => 'Map preview') }));
vi.mock('../offline/useResponderOffline', () => ({ useResponderOffline: () => offline }));
vi.mock('../offline/responderOfflineRuntime', () => ({ responderConnectivity: { subscribe: () => () => undefined, getSnapshot: () => offline.connectivity } }));
vi.mock('../api/responderRequestsApi', () => ({ listAssignedResponderRequests: vi.fn(), listCompletedResponderRequests: vi.fn(), listPendingResponderRequests: vi.fn() }));
vi.mock('../contactLocationUi', async (importOriginal) => ({ ...await importOriginal<typeof import('../contactLocationUi')>(), initiateViewLocationRoute: vi.fn() }));

const baseRequest: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011', residentId: 'resident-a', assignedResponderId: 'responder-a',
  status: 'ASSIGNED', assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.86, 6.92] }, affectedPeople: 8, medicalNeeds: true, injuredPeople: 2,
  vulnerablePeople: { children: 1, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'LIMITED', contact: { name: 'Resident', phoneNumber: '0771234567' }, description: 'Medical transport needed.',
  acceptedAt: '2026-10-01T10:00:00.000Z', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z'
};
type NodeProps = {
  children?: React.ReactNode; accessibilityLabel?: string; disabled?: boolean; onPress?: () => void;
  accessibilityState?: { disabled?: boolean; busy?: boolean };
};
function nodes(node: React.ReactNode): React.ReactElement<NodeProps>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<NodeProps>(node)) return [];
  if (typeof node.type === 'function') return nodes((node.type as (props: unknown) => React.ReactNode)(node.props));
  return [node, ...nodes(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement<NodeProps>(node)) return '';
  if (typeof node.type === 'function') return text((node.type as (props: unknown) => React.ReactNode)(node.props));
  return text(node.props.children);
}
function render(view: ResponderAssignmentView = 'active') {
  lifecycle.cursor = 0;
  lifecycle.effects = [];
  return ResponderAssignmentsScreen({ view });
}
function renderProfile() { lifecycle.cursor = 0; lifecycle.focusCallbacks = []; return ResponderProfileScreen(); }
function profileButton(label: string) {
  const found = nodes(renderProfile()).find((node) => node.props.accessibilityLabel === label);
  expect(found, label).toBeDefined();
  return found!.props;
}
async function loadProfile() {
  renderProfile(); lifecycle.focusCallbacks.forEach((callback) => callback());
  await vi.waitFor(() => expect(text(renderProfile())).not.toContain('Loading...'));
}
function button(label: string, view: ResponderAssignmentView = 'active') {
  const found = nodes(render(view)).find((node) => node.props.accessibilityLabel === label);
  expect(found, label).toBeDefined();
  return found!.props;
}
async function load(view: ResponderAssignmentView = 'active') {
  render(view);
  lifecycle.focus();
  await vi.waitFor(() => expect(text(render(view))).not.toContain('Loading responses...'));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('React', React);
  lifecycle.slots = []; lifecycle.cursor = 0; lifecycle.effects = []; lifecycle.focusCallbacks = [];
  auth.accessToken = 'responder-token';
  auth.user = { id: 'responder-a', name: 'Responder Alice', email: 'alice@example.com', role: 'EMERGENCY_RESPONDER' };
  offline.connectivity = 'online'; offline.items = []; offline.syncStatus = 'idle';
  offline.status = 'ready'; offline.error = null; offline.isSyncing = false; offline.syncError = null; offline.lastSyncedAt = null;
  offline.reload.mockResolvedValue(undefined); offline.retrySync.mockResolvedValue(undefined);
  clearResponderRequestCache();
  vi.mocked(listAssignedResponderRequests).mockResolvedValue([baseRequest]);
  vi.mocked(listCompletedResponderRequests).mockResolvedValue([]);
  vi.mocked(listPendingResponderRequests).mockResolvedValue([]);
  vi.mocked(initiateViewLocationRoute).mockResolvedValue(true);
  auth.logout.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('Responder active operational assignments', () => {
  it('shows exactly the four active statuses and excludes terminal/unassigned/other responders', async () => {
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([
      ...RESPONSE_STATUSES.map((status, index) => ({ ...baseRequest, id: `507f1f77bcf86cd79943902${index}`, status,
        assistanceType: 'OTHER' as const, description: status })),
      { ...baseRequest, id: '507f1f77bcf86cd799439040', assignedResponderId: 'responder-b', assistanceType: 'FLOOD_ASSISTANCE' }
    ]);
    await load();
    const buttons = nodes(render()).filter((node) => node.props.accessibilityLabel?.startsWith('Continue Response'));
    expect(buttons).toHaveLength(4);
    expect(text(render())).toContain('In progress');
    expect(text(render())).not.toContain('Flood Assistance');
    expect(listAssignedResponderRequests).toHaveBeenCalledWith('responder-token');
    expect(listCompletedResponderRequests).not.toHaveBeenCalled();
  });

  it('shows request context, latest timestamp, and opens the existing details route', async () => {
    const request = { ...baseRequest, fieldUpdatedAt: '2026-10-01T12:00:00.000Z' };
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([request]);
    await load();
    expect(text(render())).toContain('8 people');
    expect(text(render())).toContain('2 injured');
    expect(text(render())).toContain('GPS: 6.9200, 79.8600');
    expect(text(render())).toContain(new Date(request.fieldUpdatedAt).toLocaleString());
    button('Continue Response: Medical Assistance').onPress?.();
    expect(navigation.push).toHaveBeenCalledWith(`/responder/requests/${baseRequest.id}?sourceTab=ASSIGNED&sourceScreen=active`);
  });

  it('provides loading and empty states', async () => {
    const pending = deferred<SafeResponseRequest[]>();
    vi.mocked(listAssignedResponderRequests).mockReturnValue(pending.promise);
    render(); lifecycle.focus();
    expect(text(render())).toContain('Loading responses');
    expect(button('Refresh responses').disabled).toBe(true);
    pending.resolve([]);
    await vi.waitFor(() => expect(text(render())).toContain('No active responses'));
    expect(text(render())).toContain('Accepted emergency requests will appear here.');
  });

  it('sanitizes failures and retries/refreshes without duplicate reads', async () => {
    vi.mocked(listAssignedResponderRequests).mockRejectedValueOnce(new Error('private database credentials'));
    await load();
    expect(text(render())).toContain('Unable to load responses. Check your connection and try again.');
    expect(text(render())).not.toContain('private database');
    const pending = deferred<SafeResponseRequest[]>();
    vi.mocked(listAssignedResponderRequests).mockReturnValueOnce(pending.promise);
    const retry = button('Retry responses');
    retry.onPress?.(); retry.onPress?.();
    expect(listAssignedResponderRequests).toHaveBeenCalledTimes(2);
    pending.resolve([baseRequest]);
    await vi.waitFor(() => expect(text(render())).toContain('Medical Assistance'));
    button('Refresh responses').onPress?.();
    await vi.waitFor(() => expect(listAssignedResponderRequests).toHaveBeenCalledTimes(3));
  });

  it('does not expose an old session or cache a late response after an account switch', async () => {
    const pending = deferred<SafeResponseRequest[]>();
    vi.mocked(listAssignedResponderRequests).mockReturnValueOnce(pending.promise);
    render(); const cleanup = lifecycle.focus();
    auth.user = { ...auth.user!, id: 'responder-b' };
    auth.accessToken = 'second-token';
    expect(text(render())).not.toContain('Medical Assistance');
    cleanup?.();
    pending.resolve([baseRequest]);
    await Promise.resolve();
    offline.connectivity = 'offline';
    await load();
    expect(text(render())).not.toContain('Medical Assistance');
  });

  it('reuses owned cached assignments offline and projects local completion out of Active and Map', async () => {
    updateCachedResponderRequest({ ...baseRequest, status: 'IN_PROGRESS' });
    updateCachedResponderRequest({ ...baseRequest, id: '507f1f77bcf86cd799439041', assignedResponderId: 'responder-b' });
    offline.connectivity = 'offline';
    await load();
    expect(listAssignedResponderRequests).not.toHaveBeenCalled();
    expect(text(render())).toContain('Medical Assistance');
    offline.items = [{ localId: 'completion', responderId: 'responder-a', requestId: baseRequest.id,
      expectedStatus: 'IN_PROGRESS', sequence: 1, createdAt: '2026-10-01T12:00:00.000Z', syncState: 'pending',
      update: { type: 'progress', payload: { status: 'COMPLETED', completionDetails: { assistanceProvided: 'Medical assistance given', completionSummary: 'Resident safe' } } } }];
    expect(text(render())).toContain('No active responses');
    expect(text(render('map'))).toContain('No active response locations');
  });

  it.each(['active', 'map', 'history'] as const)('refreshes the %s list when synchronization succeeds', async (view) => {
    const endpoint = view === 'history' ? vi.mocked(listCompletedResponderRequests) : vi.mocked(listAssignedResponderRequests);
    endpoint.mockResolvedValue([{ ...baseRequest, status: view === 'history' ? 'COMPLETED' : 'IN_PROGRESS' }]);
    await load(view);
    expect(text(render(view))).toContain('Medical Assistance');
    endpoint.mockResolvedValue([]);
    offline.syncStatus = 'success';
    render(view);
    lifecycle.effects.forEach((effect) => effect());
    await vi.waitFor(() => expect(endpoint).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(text(render(view))).not.toContain('Medical Assistance'));
  });
});

describe('Responder locations', () => {
  it('uses existing map previews, details navigation and validated external route action', async () => {
    await load('map');
    text(render('map'));
    expect(LocationPreview).toHaveBeenCalledWith(expect.objectContaining({ coordinates: { latitude: 6.92, longitude: 79.86 } }));
    button('Open Request: Medical Assistance', 'map').onPress?.();
    expect(navigation.push).toHaveBeenCalledWith(`/responder/requests/${baseRequest.id}?sourceTab=ASSIGNED&sourceScreen=map`);
    button('View Location / Route: Medical Assistance', 'map').onPress?.();
    await vi.waitFor(() => expect(initiateViewLocationRoute).toHaveBeenCalledWith(6.92, 79.86));
    expect(text(render('map')).toLowerCase()).not.toContain('safe route');
  });

  it.each([undefined, { type: 'Point', coordinates: [NaN, 6.92] }, { type: 'Point', coordinates: [181, 91] }])('handles unavailable coordinates %j without opening maps', async (location) => {
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([{ ...baseRequest, location: location as SafeResponseRequest['location'] }]);
    await load('map');
    expect(text(render('map'))).toContain('Emergency location unavailable');
    const route = button('View Location / Route: Medical Assistance', 'map');
    expect(route.disabled).toBe(true);
    route.onPress?.();
    expect(initiateViewLocationRoute).not.toHaveBeenCalled();
    expect(LocationPreview).not.toHaveBeenCalled();
    button('Open Request: Medical Assistance', 'map').onPress?.();
    expect(navigation.push).toHaveBeenCalled();
  });

  it('prevents duplicate route launches and provides a useful failure/retry message', async () => {
    await load('map');
    const pending = deferred<boolean>();
    vi.mocked(initiateViewLocationRoute).mockReturnValueOnce(pending.promise);
    const route = button('View Location / Route: Medical Assistance', 'map');
    route.onPress?.(); route.onPress?.();
    expect(initiateViewLocationRoute).toHaveBeenCalledTimes(1);
    expect(button('View Location / Route: Medical Assistance', 'map').disabled).toBe(true);
    pending.resolve(false);
    await vi.waitFor(() => expect(text(render('map'))).toContain('Unable to open the map or browser. Please try again.'));
    expect(button('View Location / Route: Medical Assistance', 'map').disabled).toBe(false);
  });
});

describe('Responder completed history', () => {
  it('shows confirmed own completions and opens the reused details screen', async () => {
    const completed = { ...baseRequest, status: 'COMPLETED' as const, completedAt: '2026-10-02T12:00:00.000Z', completionSummary: 'Resident safely evacuated.' };
    vi.mocked(listCompletedResponderRequests).mockResolvedValue([completed, baseRequest,
      { ...completed, id: '507f1f77bcf86cd799439042', assignedResponderId: 'responder-b', assistanceType: 'OTHER' }]);
    await load('history');
    expect(listCompletedResponderRequests).toHaveBeenCalledWith('responder-token');
    expect(listAssignedResponderRequests).not.toHaveBeenCalled();
    expect(nodes(render('history')).filter((node) => node.props.accessibilityLabel?.startsWith('Open Request'))).toHaveLength(1);
    expect(text(render('history'))).toContain('Resident safely evacuated.');
    expect(text(render('history'))).toContain(new Date(completed.completedAt).toLocaleString());
    button('Open Request: Medical Assistance', 'history').onPress?.();
    expect(navigation.push).toHaveBeenCalledWith(`/responder/requests/${baseRequest.id}?sourceTab=ASSIGNED&sourceScreen=history`);
  });

  it('handles empty history, errors and retry', async () => {
    await load('history');
    expect(text(render('history'))).toContain('No completed responses yet.');
    expect(text(render('history'))).toContain('Requests you complete will appear here.');
    vi.mocked(listCompletedResponderRequests).mockRejectedValueOnce(new Error('private details'));
    button('Refresh responses', 'history').onPress?.();
    await vi.waitFor(() => expect(text(render('history'))).toContain('Unable to load responses'));
    button('Retry responses', 'history').onPress?.();
    await vi.waitFor(() => expect(text(render('history'))).toContain('No completed responses yet.'));
  });
});

describe('Responder profile and routes', () => {
  it('derives Active and Available counts from existing owned assignments and visible NEW requests', async () => {
    vi.mocked(listAssignedResponderRequests).mockResolvedValue([
      ...RESPONSE_STATUSES.map((status, index) => ({ ...baseRequest, id: `507f1f77bcf86cd79943902${index}`, status })),
      { ...baseRequest, assignedResponderId: 'responder-b' }
    ]);
    vi.mocked(listPendingResponderRequests).mockResolvedValue([
      { ...baseRequest, status: 'NEW' }, { ...baseRequest, status: 'NEW', id: 'another-request' },
      { ...baseRequest, status: 'COMPLETED' }, { ...baseRequest, status: 'NEW', declinedByResponderIds: ['responder-a'] }
    ]);
    await loadProfile();
    expect(text(renderProfile())).toContain('Active Assignments 4');
    expect(text(renderProfile())).toContain('Available Requests 2');
    expect(listAssignedResponderRequests).toHaveBeenCalledWith('responder-token');
    expect(listPendingResponderRequests).toHaveBeenCalledWith('responder-token');
  });

  it('offers the existing Active and History destinations as profile shortcuts', () => {
    profileButton('Active Responses').onPress?.();
    expect(navigation.push).toHaveBeenCalledWith('/responder/active');
    profileButton('Response History').onPress?.();
    expect(navigation.push).toHaveBeenCalledWith('/responder/history');
  });

  it('shows loading, safe request errors, and count refresh without duplicate API reads', async () => {
    const assigned = deferred<SafeResponseRequest[]>();
    vi.mocked(listAssignedResponderRequests).mockReturnValueOnce(assigned.promise);
    vi.mocked(listPendingResponderRequests).mockRejectedValueOnce(new Error('private database URI'));
    renderProfile(); lifecycle.focusCallbacks.forEach((callback) => callback());
    expect(text(renderProfile())).toContain('Loading...');
    expect(profileButton('Refresh response counts').disabled).toBe(true);
    assigned.resolve([]);
    await vi.waitFor(() => expect(text(renderProfile())).toContain('Unable to load available requests. Please retry.'));
    expect(text(renderProfile())).not.toContain('private database');
    const retry = profileButton('Refresh response counts');
    retry.onPress?.(); retry.onPress?.();
    await vi.waitFor(() => expect(text(renderProfile())).toContain('Available Requests 0'));
    expect(listAssignedResponderRequests).toHaveBeenCalledTimes(2);
    expect(listPendingResponderRequests).toHaveBeenCalledTimes(2);
  });

  it('uses owned cached Active data offline and does not invent an Available count', async () => {
    offline.connectivity = 'offline';
    updateCachedResponderRequest(baseRequest);
    await loadProfile();
    expect(text(renderProfile())).toContain('Active Assignments 1');
    expect(text(renderProfile())).toContain('Available Requests Unavailable');
    expect(text(renderProfile())).toContain('Updates can be saved offline');
    expect(listAssignedResponderRequests).not.toHaveBeenCalled();
    expect(listPendingResponderRequests).not.toHaveBeenCalled();
    expect(profileButton('Refresh response counts').disabled).toBe(true);
  });

  it('displays real owner-scoped saved updates and sync time and retries through the existing hook', async () => {
    const item: QueuedResponderUpdate = {
      localId: 'local-update', responderId: 'responder-a', requestId: baseRequest.id, expectedStatus: 'ASSIGNED',
      sequence: 1, createdAt: '2026-10-01T12:00:00.000Z', syncState: 'pending',
      update: { type: 'progress', payload: { status: 'DISPATCHED' } }
    };
    offline.items = [item, { ...item, localId: 'second-update', sequence: 2 }, { ...item, responderId: 'responder-b' }];
    offline.lastSyncedAt = '2026-10-01T11:00:00.000Z';
    expect(text(renderProfile())).toContain('Pending offline updates 2');
    expect(text(renderProfile())).toContain('2 updates waiting to synchronize');
    expect(text(renderProfile())).toContain(new Date(offline.lastSyncedAt).toLocaleString());
    const pending = deferred<void>();
    offline.retrySync.mockReturnValueOnce(pending.promise);
    const retry = profileButton('Retry Sync');
    retry.onPress?.(); retry.onPress?.();
    expect(offline.retrySync).toHaveBeenCalledTimes(1);
    expect(profileButton('Retry Sync').disabled).toBe(true);
    pending.resolve(undefined); await Promise.resolve();
    expect(offline.items).toHaveLength(3);
    offline.connectivity = 'offline';
    expect(profileButton('Retry Sync').disabled).toBe(true);
    profileButton('Retry Sync').onPress?.();
    expect(offline.retrySync).toHaveBeenCalledTimes(1);
  });

  it('handles queue loading/errors and unavailable sync metadata without reporting fake success', async () => {
    Reflect.deleteProperty(offline, 'lastSyncedAt');
    offline.status = 'loading';
    expect(text(renderProfile())).toContain('Pending offline updates Checking...');
    expect(text(renderProfile())).not.toContain('All responder updates synchronized');
    expect(text(renderProfile())).not.toContain('Last synchronized');
    offline.status = 'error'; offline.error = 'private storage error';
    expect(text(renderProfile())).toContain('They remain on this device.');
    expect(text(renderProfile())).not.toContain('private storage');
    profileButton('Retry reading saved updates').onPress?.();
    await vi.waitFor(() => expect(offline.reload).toHaveBeenCalledTimes(1));
    offline.status = 'ready'; offline.error = null;
    expect(text(renderProfile())).toContain('All responder updates synchronized');
    expect(nodes(renderProfile()).some((node) => node.props.accessibilityLabel === 'Retry Sync')).toBe(false);
  });

  it('keeps saved updates on logout and sanitizes a manual synchronization failure', async () => {
    offline.items = [{ localId: 'local-update', responderId: 'responder-a', requestId: baseRequest.id,
      expectedStatus: 'ASSIGNED', sequence: 1, createdAt: '2026-10-01T12:00:00.000Z', syncState: 'pending',
      update: { type: 'progress', payload: { status: 'DISPATCHED' } } }];
    offline.retrySync.mockRejectedValueOnce(new Error('secret sync token'));
    profileButton('Retry Sync').onPress?.();
    await vi.waitFor(() => expect(text(renderProfile())).toContain('Unable to retry saved updates. Please try again.'));
    expect(text(renderProfile())).not.toContain('secret sync');
    profileButton('Log out').onPress?.();
    await Promise.resolve();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(offline.items).toHaveLength(1);
    expect(offline.reload).not.toHaveBeenCalled();
  });

  it('handles missing account fields and a missing session without exposing operational data', async () => {
    auth.user = { ...auth.user!, name: '', email: '' };
    expect(text(renderProfile())).toContain('Name Not available');
    expect(text(renderProfile())).toContain('Email Not available');
    auth.user = null; auth.accessToken = null;
    await loadProfile();
    expect(text(renderProfile())).toContain('Your responder profile is unavailable.');
    expect(text(renderProfile())).not.toContain('RESPONSE STATUS');
    expect(listAssignedResponderRequests).not.toHaveBeenCalled();
    expect(listPendingResponderRequests).not.toHaveBeenCalled();
  });

  it('masks stale Pending counts and ignores a late request after switching responders', async () => {
    const pending = deferred<SafeResponseRequest[]>();
    vi.mocked(listPendingResponderRequests).mockReturnValueOnce(pending.promise);
    renderProfile(); const callbacks = [...lifecycle.focusCallbacks];
    const cleanups = callbacks.map((callback) => callback());
    auth.user = { ...auth.user!, id: 'responder-b' }; auth.accessToken = 'second-token';
    expect(text(renderProfile())).not.toContain('Available Requests 1');
    cleanups.forEach((cleanup) => cleanup?.());
    pending.resolve([{ ...baseRequest, status: 'NEW' }]); await Promise.resolve();
    expect(text(renderProfile())).not.toContain('Available Requests 1');
    await loadProfile();
    expect(listPendingResponderRequests).toHaveBeenLastCalledWith('second-token');
    expect(text(renderProfile())).toContain('Available Requests 0');
  });

  it('displays only authenticated public profile fields and connection status', () => {
    const content = text(renderProfile());
    expect(content).toContain('Responder Alice'); expect(content).toContain('alice@example.com');
    expect(content).toContain('Emergency Responder'); expect(content).toContain('Online');
    expect(content).not.toContain('responder-token'); expect(content).not.toContain('responder-a');
    offline.connectivity = 'offline';
    expect(text(renderProfile())).toContain('Offline');
    auth.user = { ...auth.user!, role: 'RESIDENT' };
    expect(text(renderProfile())).not.toContain('alice@example.com');
  });

  it('uses shared auth logout, prevents repeat taps, and allows retry after a safe error', async () => {
    const pending = deferred<void>();
    auth.logout.mockReturnValueOnce(pending.promise);
    const logout = nodes(renderProfile()).find((node) => node.props.accessibilityLabel === 'Log out')!.props;
    logout.onPress?.(); logout.onPress?.();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(nodes(renderProfile()).find((node) => node.props.accessibilityLabel === 'Log out')?.props.disabled).toBe(true);
    pending.resolve(undefined); await Promise.resolve();
    auth.logout.mockRejectedValueOnce(new Error('secret logout internals'));
    nodes(renderProfile()).find((node) => node.props.accessibilityLabel === 'Log out')?.props.onPress?.();
    await vi.waitFor(() => expect(text(renderProfile())).toContain('Unable to finish logging out. Please try again.'));
    expect(text(renderProfile())).not.toContain('secret logout');
  });

  it('binds each bottom destination to a functional feature screen', () => {
    expect(ResponderActiveRoute().props).toMatchObject({ view: 'active' });
    expect(ResponderMapRoute().props).toMatchObject({ view: 'map' });
    expect(ResponderHistoryRoute().props).toMatchObject({ view: 'history' });
    expect(ResponderProfileRoute().type).toBe(ResponderProfileScreen);
  });
});
