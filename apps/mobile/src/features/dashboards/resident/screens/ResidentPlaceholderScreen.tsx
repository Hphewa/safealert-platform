import { useLocalSearchParams } from 'expo-router';

import { FeaturePlaceholderScreen } from '../../shared/components/FeaturePlaceholderScreen';
import { residentBottomNavItems, residentPlaceholderContent } from '../mockData';

export function ResidentPlaceholderScreen() {
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const screenKey = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const placeholder =
    (screenKey && residentPlaceholderContent[screenKey]) || residentPlaceholderContent.profile;

  return (
    <FeaturePlaceholderScreen
      bottomNavItems={residentBottomNavItems}
      description={placeholder.description}
      homeHref="/resident"
      title={placeholder.title}
    />
  );
}
