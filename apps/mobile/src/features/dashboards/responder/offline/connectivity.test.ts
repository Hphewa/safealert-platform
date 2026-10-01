import { describe, expect, it, vi } from 'vitest';
import { connectivityFor, createConnectivityStore } from './connectivity';

describe('responder connectivity', () => {
  it.each([
    [true, true, 'online'], [false, false, 'offline'], [true, false, 'offline'],
    [false, null, 'offline'], [true, null, 'unknown'], [null, null, 'unknown'], [null, true, 'unknown']
  ] as const)('maps connection %s / internet %s to %s', (isConnected, isInternetReachable, expected) => {
    expect(connectivityFor({ isConnected, isInternetReachable })).toBe(expected);
  });
  it('shares one listener, publishes transitions, and cleans up after the last subscriber', () => {
    let emit: Parameters<Parameters<typeof createConnectivityStore>[0]['listen']>[0] = () => undefined;
    const stop = vi.fn();
    const listen = vi.fn((callback: typeof emit) => { emit = callback; return stop; });
    const store = createConnectivityStore({ listen });
    const first = vi.fn(), second = vi.fn();
    const unsubscribe = store.subscribe(first), unsubscribeSecond = store.subscribe(second);
    expect(store.getSnapshot()).toBe('unknown');
    expect(listen).toHaveBeenCalledTimes(1);
    emit({ isConnected: true, isInternetReachable: true });
    expect(store.getSnapshot()).toBe('online');
    emit({ isConnected: false, isInternetReachable: false });
    expect(store.getSnapshot()).toBe('offline');
    expect(second).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(stop).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe('unknown');
  });
  it('handles an unavailable native listener without assuming online', () => {
    const store = createConnectivityStore({ listen: () => { throw new Error('unavailable'); } });
    const stop = store.subscribe(vi.fn());
    expect(store.getSnapshot()).toBe('unknown');
    expect(stop).not.toThrow();
  });
});
