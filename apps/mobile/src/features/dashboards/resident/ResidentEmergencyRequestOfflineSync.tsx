import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { useAuth } from '../../auth/hooks/useAuth';
import { useEmergencyAssistanceDraft } from './emergencyAssistanceDraft';
import { listQueuedEmergencyRequests, syncQueuedEmergencyRequests } from './offlineEmergencyRequestQueue';

export function ResidentEmergencyRequestOfflineSync() {
  const { user, accessToken } = useAuth();
  const { resetDraft } = useEmergencyAssistanceDraft();
  const router = useRouter();
  useEffect(() => {
    if (!user?.id || !accessToken) return;
    let active = true;
    const sync = async () => {
      const before = await listQueuedEmergencyRequests(user.id);
      const result = await syncQueuedEmergencyRequests(user.id, accessToken);
      if (active && result.synced > 0 && before[0]) {
        // The idempotent create endpoint returns the authoritative request; reload it
        // through the resident list is intentionally deferred to the existing screen.
        resetDraft();
        router.replace('/resident/my-emergency-requests');
      }
    };
    void sync();
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected === true && state.isInternetReachable !== false) void sync();
    });
    return () => { active = false; unsubscribe(); };
  }, [accessToken, resetDraft, router, user?.id]);
  return null;
}
