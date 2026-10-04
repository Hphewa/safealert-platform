import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../auth/hooks/useAuth';
import { getRiskLocationDetails } from '../details/riskLocationDetailsApi';
import { createRiskLocationDetailsResource } from '../details/riskLocationDetailsResource';

export function useRiskLocationDetails() {
  const { accessToken, user } = useAuth();
  const params = useLocalSearchParams<{ incidentId?: string | string[] }>();
  const incidentId = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
  const role = user?.role;
  const userId = user?.id;
  const resource = useMemo(() => createRiskLocationDetailsResource(async () => {
    if (!accessToken || !role || !userId || !incidentId) throw new Error('Session unavailable.');
    return getRiskLocationDetails(incidentId, accessToken, role);
  }), [accessToken, role, userId, incidentId]);
  const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  useFocusEffect(useCallback(() => {
    if (AppState.currentState === 'active' || AppState.currentState === null) void resource.start();
    const listener = AppState.addEventListener('change', status => {
      if (status === 'active') void resource.start(); else resource.suspend();
    });
    return () => { listener.remove(); resource.suspend(); };
  }, [resource]));
  return { ...snapshot, refresh: resource.refresh };
}
