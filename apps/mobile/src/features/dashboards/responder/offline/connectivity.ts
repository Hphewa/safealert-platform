export type Connectivity = 'online' | 'offline' | 'unknown';
type NetworkState = { isConnected: boolean | null; isInternetReachable: boolean | null };

export function connectivityFor(state: NetworkState): Connectivity {
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  // A Wi-Fi connection alone does not establish internet reachability.
  return state.isConnected === true && state.isInternetReachable === true ? 'online' : 'unknown';
}

export function createConnectivityStore(source: {
  listen: (listener: (state: NetworkState) => void) => () => void;
}) {
  let current: Connectivity = 'unknown';
  let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        // All responder screens share one subscription, released when the last screen leaves.
        try {
          stop = source.listen((state) => {
            const next = connectivityFor(state);
            if (current === next) return;
            current = next;
            listeners.forEach((notify) => notify());
          });
        } catch {
          current = 'unknown';
        }
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stop?.();
          stop = undefined;
          current = 'unknown';
        }
      };
    }
  };
}
