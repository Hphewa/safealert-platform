import type * as React from 'react';
import type { SafeUser } from '@safealert/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createResponderUpdateQueue } from './responderUpdateQueue';
import { useResponderOffline } from './useResponderOffline';

const hooks = vi.hoisted(() => ({
  ref: { current: null as string | null },
  effects: [] as (() => void | (() => void))[],
  lastSyncedAt: null as string | null
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useRef: () => hooks.ref,
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useSyncExternalStore: (...args: [unknown, () => unknown]) => args[1]()
}));
vi.mock('./responderOfflineRuntime', async () => {
  const { createResponderUpdateQueue } = await import('./responderUpdateQueue');
  return {
    responderConnectivity: { getSnapshot: () => 'offline', subscribe: vi.fn() },
    responderUpdateQueue: createResponderUpdateQueue({ getItem: async () => null, setItem: async () => undefined }),
    responderSyncService: {
      subscribe: vi.fn(),
      getSnapshot: (owner: string) => ({ status: 'idle', isSyncing: false, syncedCount: 0, lastError: null,
        lastSyncedAt: owner === 'responder-1' ? hooks.lastSyncedAt : null }),
      retrySync: vi.fn(), setActiveSession: vi.fn(), clearActiveSession: vi.fn()
    }
  };
});
const responder: SafeUser = { id: 'responder-1', name: 'Responder', email: 'responder@example.com', role: 'EMERGENCY_RESPONDER' };
beforeEach(() => { hooks.ref.current = null; hooks.effects = []; hooks.lastSyncedAt = null; });

describe('responder offline hook scope', () => {
  it('exposes only the existing sync service timestamp for the current account', () => {
    expect(useResponderOffline(responder, 'token').lastSyncedAt).toBeNull();
    hooks.lastSyncedAt = '2026-10-01T12:00:00.000Z';
    expect(useResponderOffline(responder, 'token').lastSyncedAt).toBe(hooks.lastSyncedAt);
    expect(useResponderOffline({ ...responder, id: 'responder-2' }, 'other-token').lastSyncedAt).toBeNull();
  });
  it('invalidates an old request/session callback immediately on account change', () => {
    const first = useResponderOffline(responder, 'token:request-1');
    expect(first.isCurrent()).toBe(true);
    const second = useResponderOffline({ ...responder, id: 'responder-2' }, 'other-token:request-1');
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(second.items).toEqual([]);
  });
  it('invalidates callbacks on unmount and never exposes another role’s queue', () => {
    const state = useResponderOffline(responder, 'token:request-1');
    const cleanup = hooks.effects[0]();
    expect(state.isCurrent()).toBe(true);
    cleanup?.();
    expect(state.isCurrent()).toBe(false);
    expect(useResponderOffline({ ...responder, role: 'RESIDENT' }, 'token').items).toEqual([]);
  });
  it('an independent queue starts loading rather than claiming no pending work', () => {
    const queue = createResponderUpdateQueue({ getItem: async () => null, setItem: async () => undefined });
    expect(queue.getSnapshot(responder.id).status).toBe('loading');
  });
});
