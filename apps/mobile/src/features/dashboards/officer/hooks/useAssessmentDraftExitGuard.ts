import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';

type RouteState = { index?: number; routes?: Array<{ name?: string }> };
function isWizardStepTransition(state: RouteState | undefined): boolean {
  if (!state?.routes || state.index === undefined) return false;
  const current = state.routes[state.index]?.name ?? '';
  const previous = state.routes[state.index - 1]?.name ?? '';
  const flow = (name: string) => name.includes('wizard/') || name.includes('reassess/');
  return flow(current) && flow(previous) &&
    ((current.includes('wizard/') && previous.includes('wizard/')) ||
      (current.includes('reassess/') && previous.includes('reassess/')));
}

export function useAssessmentDraftExitGuard(enabled: boolean, onDiscard: () => Promise<void>) {
  const navigation = useNavigation();
  const alertOpen = useRef(false);
  const nextRemovalAllowed = useRef(false);
  const allowNextRemoval = useCallback(() => { nextRemovalAllowed.current = true; }, []);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (nextRemovalAllowed.current) { nextRemovalAllowed.current = false; return; }
    if (!enabled || alertOpen.current || isWizardStepTransition(navigation.getState() as RouteState)) return;
    event.preventDefault();
    alertOpen.current = true;
    Alert.alert('Discard assessment changes?', 'Your unsaved assessment changes will be removed.', [
      { text: 'Keep Editing', style: 'cancel', onPress: () => { alertOpen.current = false; } },
      { text: 'Discard', style: 'destructive', onPress: () => {
        void onDiscard().then(() => navigation.dispatch(event.data.action)).finally(() => { alertOpen.current = false; });
      } }
    ], { cancelable: true, onDismiss: () => { alertOpen.current = false; } });
  }), [enabled, navigation, onDiscard]);
  return allowNextRemoval;
}
