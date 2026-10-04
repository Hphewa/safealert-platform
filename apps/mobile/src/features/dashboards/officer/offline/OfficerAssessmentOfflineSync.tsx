import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../../auth/hooks/useAuth';
import { syncOfficerAssessmentQueue } from './officerAssessmentQueue';

export function OfficerAssessmentOfflineSync() {
  const { user, accessToken } = useAuth();
  useEffect(() => {
    if (!user?.id || !accessToken) return;
    const sync = () => { void syncOfficerAssessmentQueue(user.id, accessToken); };
    sync();
    return NetInfo.addEventListener((state) => {
      if (state.isConnected === true && state.isInternetReachable !== false) sync();
    });
  }, [accessToken, user?.id]);
  return null;
}
