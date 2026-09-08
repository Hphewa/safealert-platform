import { useLocalSearchParams } from 'expo-router';

import { FeaturePlaceholderScreen } from '../../shared/components/FeaturePlaceholderScreen';
import { officerBottomNavItems, officerPlaceholderContent } from '../mockData';

export function OfficerPlaceholderScreen() {
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const screenKey = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const placeholder =
    (screenKey && officerPlaceholderContent[screenKey]) || officerPlaceholderContent.profile;

  return (
    <FeaturePlaceholderScreen
      bottomNavItems={officerBottomNavItems}
      description={placeholder.description}
      homeHref="/officer"
      title={placeholder.title}
    />
  );
}
