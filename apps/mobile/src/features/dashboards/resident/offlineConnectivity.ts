import NetInfo from '@react-native-community/netinfo';

export function subscribeToConnectivity(listener: (connected: boolean) => void) {
  return NetInfo.addEventListener((state) => {
    listener(Boolean(state.isConnected && state.isInternetReachable !== false));
  });
}
