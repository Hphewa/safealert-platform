import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../auth/hooks/useAuth';
import { getRiskMap } from '../api/riskMapApi';
import { createRiskMapResource } from '../riskMapResource';

export function useRiskMap() {
  const { accessToken, user } = useAuth();
  const role = user?.role;
  const userId = user?.id;
  const resource = useMemo(() => createRiskMapResource(async () => {
    if (!accessToken || !role || !userId) throw new Error('Session unavailable.');
    return getRiskMap(accessToken, role);
  }), [accessToken, role, userId]);
  const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  useFocusEffect(useCallback(() => {
    if (AppState.currentState === 'active' || AppState.currentState === null) void resource.start();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resource.start();
      else resource.suspend();
    });
    return () => { listener.remove(); resource.suspend(); };
  }, [resource]));
  return { ...snapshot, refresh: resource.refresh, select: resource.select };
}
