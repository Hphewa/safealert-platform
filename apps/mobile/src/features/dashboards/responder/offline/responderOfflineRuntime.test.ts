import { beforeEach, describe, expect, it, vi } from 'vitest';
import { responderConnectivity } from './responderOfflineRuntime';

type NetworkState = { isConnected: boolean | null; isInternetReachable: boolean | null };
const native = vi.hoisted(() => ({
  emit: vi.fn<(state: NetworkState) => void>(),
  foreground: vi.fn<(state: string) => void>(),
  stop: vi.fn(), remove: vi.fn(), fetch: vi.fn<() => Promise<NetworkState>>()
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
vi.mock('@react-native-community/netinfo', () => ({ default: {
  configure: vi.fn(),
  fetch: native.fetch,
  addEventListener: (listener: typeof native.emit) => { native.emit = listener; return native.stop; }
} }));
vi.mock('react-native', () => ({ AppState: {
  addEventListener: (_event: string, listener: typeof native.foreground) => {
    native.foreground = listener; return { remove: native.remove };
  }
} }));

beforeEach(() => { vi.clearAllMocks(); });
describe('native responder connectivity adapter', () => {
  it('ignores an older initial read after an offline event and rechecks on foreground', async () => {
    let resolve!: (state: NetworkState) => void;
    native.fetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const unsubscribe = responderConnectivity.subscribe(vi.fn());
    native.emit({ isConnected: false, isInternetReachable: false });
    resolve({ isConnected: true, isInternetReachable: true });
    await Promise.resolve();
    expect(responderConnectivity.getSnapshot()).toBe('offline');
    native.fetch.mockResolvedValueOnce({ isConnected: true, isInternetReachable: true });
    native.foreground('active');
    await Promise.resolve();
    expect(responderConnectivity.getSnapshot()).toBe('online');
    unsubscribe();
    expect(native.stop).toHaveBeenCalledOnce();
    expect(native.remove).toHaveBeenCalledOnce();
  });

  it('handles a rejected read and ignores async results after cleanup', async () => {
    native.fetch.mockRejectedValueOnce(new Error('native unavailable'));
    let unsubscribe = responderConnectivity.subscribe(vi.fn());
    await vi.waitFor(() => expect(responderConnectivity.getSnapshot()).toBe('unknown'));
    unsubscribe();
    let resolve!: (state: NetworkState) => void;
    native.fetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    unsubscribe = responderConnectivity.subscribe(vi.fn());
    unsubscribe();
    resolve({ isConnected: true, isInternetReachable: true });
    await Promise.resolve();
    expect(responderConnectivity.getSnapshot()).toBe('unknown');
  });
});
