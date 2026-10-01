import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { apiBaseUrl } from '../../../../services/api/client';
import { createConnectivityStore } from './connectivity';
import { createResponderUpdateQueue } from './responderUpdateQueue';

// Browsers need a CORS-enabled reachability target, including localhost testing.
// Reuse SafeAlert's public health endpoint instead of depending on an unrelated website.
NetInfo.configure({
  reachabilityUrl: `${apiBaseUrl}/health`,
  reachabilityMethod: 'GET',
  reachabilityTest: async (response) => {
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && 'service' in body && body.service === 'safealert-api';
  }
});

export const responderUpdateQueue = createResponderUpdateQueue(AsyncStorage);
export const responderConnectivity = createConnectivityStore({
  listen(listener) {
    let active = true;
    let revision = 0;
    const stopNetwork = NetInfo.addEventListener((state) => {
      revision += 1;
      listener(state);
    });
    // Re-read on foreground because native network notifications can pause in the background.
    // A delayed fetch must not overwrite a more recent connectivity event.
    const refresh = () => {
      const startedAt = revision;
      void NetInfo.fetch().then((state) => {
        if (active && revision === startedAt) listener(state);
      }).catch(() => {
        if (active && revision === startedAt) listener({ isConnected: null, isInternetReachable: null });
      });
    };
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    refresh();
    return () => { active = false; stopNetwork(); foreground.remove(); };
  }
});
