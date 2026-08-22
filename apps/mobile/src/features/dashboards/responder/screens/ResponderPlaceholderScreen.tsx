import { useLocalSearchParams } from 'expo-router';

import { FeaturePlaceholderScreen } from '../../shared/components/FeaturePlaceholderScreen';
import { responderBottomNavItems, responderPlaceholderContent } from '../mockData';

export function ResponderPlaceholderScreen() {
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const screenKey = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const placeholder =
    (screenKey && responderPlaceholderContent[screenKey]) || responderPlaceholderContent.profile;

  return (
    <FeaturePlaceholderScreen
      bottomNavItems={responderBottomNavItems}
      description={placeholder.description}
      homeHref="/responder"
      title={placeholder.title}
    />
  );
}
