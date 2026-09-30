import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getWarningDelivery } from '../api/warningApi';

type DeliveryState = {
  warningId: string;
  accessToken: string;
  data: Awaited<ReturnType<typeof getWarningDelivery>> | null;
  loading: boolean;
  error: string | null;
};

// Publication returns before delivery records are written. Refresh the read-only
// summary while this screen is active, including initially empty/partial results.
export function useWarningDelivery(warningId: string | undefined, accessToken: string | null, enabled: boolean) {
  const [state, setState] = useState<DeliveryState | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => {
    setState(null);
    setRevision(value => value + 1);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!warningId || !accessToken || !enabled) return;
    let stop = () => {};

    const start = () => {
      stop();
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      stop = () => { active = false; clearTimeout(timer); };
      setState({ warningId, accessToken, data: null, loading: true, error: null });

      const refresh = async () => {
        try {
          const data = await getWarningDelivery(warningId, accessToken);
          if (!active) return;
          setState({ warningId, accessToken, data, loading: false, error: null });
          // Schedule after completion so slow requests cannot overlap.
          timer = setTimeout(() => void refresh(), 5000);
        } catch {
          if (!active) return;
          setState({ warningId, accessToken, data: null, loading: false, error: 'Unable to load delivery status.' });
          // Errors remain visible until the officer retries or revisits the screen.
        }
      };
      void refresh();
    };

    if (!AppState.currentState || AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') start();
      else stop();
    });
    return () => { stop(); subscription.remove(); };
  }, [warningId, accessToken, enabled, revision]));

  // Never display another warning/session's data, even before focus cleanup runs.
  const current = enabled && state?.warningId === warningId && state?.accessToken === accessToken ? state : null;
  return {
    data: current?.data ?? null,
    loading: enabled && Boolean(warningId && accessToken) && (current?.loading ?? true),
    error: current?.error ?? null,
    reload
  };
}
