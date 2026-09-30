import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWarningDelivery } from '../api/warningApi';
import { useWarningDelivery } from './useWarningDelivery';

type FocusEffect = () => void | (() => void);
// Lightweight hook slots/focus events, matching the existing device-free mobile
// test approach. The real hook, timers, promises and API client are exercised.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  focus: undefined as FocusEffect | undefined,
  previousFocus: undefined as FocusEffect | undefined,
  cleanup: undefined as (() => void) | undefined,
  appListener: undefined as ((state: string) => void) | undefined,
  removed: vi.fn()
}));

vi.mock('react', () => ({
  useState: <T>(initial: T) => {
    const index = hooks.cursor++;
    if (index >= hooks.slots.length) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof value === 'function'
        ? (value as (previous: T) => T)(hooks.slots[index] as T) : value;
    }];
  },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const index = hooks.cursor++;
    const prior = hooks.slots[index] as { callback: unknown; deps: unknown[] } | undefined;
    if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) hooks.slots[index] = { callback, deps };
    return (hooks.slots[index] as { callback: unknown }).callback;
  }
}));
vi.mock('expo-router', () => ({ useFocusEffect: (effect: FocusEffect) => { hooks.focus = effect; } }));
vi.mock('react-native', () => ({ AppState: {
  currentState: 'active',
  addEventListener: (_event: string, listener: (state: string) => void) => {
    hooks.appListener = listener;
    return { remove: hooks.removed };
  }
} }));

type Delivery = Awaited<ReturnType<typeof getWarningDelivery>>;
const empty: Delivery = {
  summary: { recipientCount: 0, sms: { sent: 0, failed: 0, skipped: 0 }, push: { sent: 0, failed: 0, skipped: 0 } },
  failedDeliveries: []
};
const delivered: Delivery = {
  summary: { recipientCount: 1, sms: { sent: 0, failed: 0, skipped: 1 }, push: { sent: 1, failed: 0, skipped: 0 } },
  failedDeliveries: []
};
const warningId = '6abcaaf9e79cadd4cf17d8c9';
const json = (data: Delivery) => new Response(JSON.stringify(data), { status: 200 });

function render(id: string | undefined = warningId, token: string | null = 'officer-token', enabled = true) {
  hooks.cursor = 0;
  const result = useWarningDelivery(id, token, enabled);
  if (hooks.focus !== hooks.previousFocus) {
    hooks.cleanup?.();
    hooks.previousFocus = hooks.focus;
    hooks.cleanup = hooks.focus?.() || undefined;
  }
  return result;
}
async function settle() { await vi.advanceTimersByTimeAsync(0); }

beforeEach(() => {
  vi.useFakeTimers();
  hooks.slots = []; hooks.cursor = 0;
  hooks.focus = undefined; hooks.previousFocus = undefined; hooks.cleanup = undefined;
  hooks.appListener = undefined; hooks.removed.mockClear();
});
afterEach(() => {
  hooks.cleanup?.();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('warning delivery refresh lifecycle', () => {
  it('refreshes an initial empty response to the real counts without republishing or resending', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(empty)).mockImplementation(async () => json(delivered));
    vi.stubGlobal('fetch', fetchMock);
    expect(render().loading).toBe(true);
    await settle();
    expect(render().data).toEqual(empty);
    await vi.advanceTimersByTimeAsync(5000);
    expect(render().data).toEqual(delivered);
    expect(render().loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toContain(`/warnings/${warningId}/delivery`);
      expect(options.method).toBe('GET');
    }
  });

  it('continues refreshing partial records after SMS is recorded but before PUSH arrives', async () => {
    const partial = structuredClone(delivered);
    partial.summary.push.sent = 0;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(partial)).mockImplementation(async () => json(delivered)));
    render(); await settle();
    expect(render().data?.summary.push.sent).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(render().data?.summary.push.sent).toBe(1);
  });

  it('ignores a late response for the previous warning and never overlaps requests', async () => {
    let resolveOld!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
      .mockImplementation(async () => json(delivered));
    vi.stubGlobal('fetch', fetchMock);
    render();
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const nextId = '507f1f77bcf86cd799439111';
    expect(render(nextId).data).toBeNull();
    await settle();
    expect(render(nextId).data).toEqual(delivered);
    resolveOld(json(empty)); await settle();
    expect(render(nextId).data).toEqual(delivered);
    expect(fetchMock.mock.calls[1]![0]).toContain(`/warnings/${nextId}/delivery`);
  });

  it('shows refresh errors instead of stale/zero counts, and reload retries the GET', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(delivered))
      .mockRejectedValueOnce(new Error('Offline')).mockImplementation(async () => json(delivered));
    vi.stubGlobal('fetch', fetchMock);
    render(); await settle();
    await vi.advanceTimersByTimeAsync(5000);
    const failed = render();
    expect(failed).toMatchObject({ data: null, loading: false, error: 'Unable to load delivery status.' });
    failed.reload(); render(); await settle();
    expect(render()).toMatchObject({ data: delivered, loading: false, error: null });
  });

  it('stops on blur, refreshes on refocus, and pauses in the Android/web background', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(delivered));
    vi.stubGlobal('fetch', fetchMock);
    render(); await settle();
    hooks.appListener!('background');
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    hooks.appListener!('active'); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    hooks.cleanup!();
    expect(hooks.removed).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    hooks.previousFocus = undefined;
    hooks.cleanup = undefined;
    render(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('clears data and stops requests on logout or when delivery is disabled', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(delivered));
    vi.stubGlobal('fetch', fetchMock);
    render(); await settle();
    expect(render(warningId, null).data).toBeNull();
    expect(render(warningId, 'officer-token', false).data).toBeNull();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
