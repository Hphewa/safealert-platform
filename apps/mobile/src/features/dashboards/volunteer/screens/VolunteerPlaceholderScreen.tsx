import { useLocalSearchParams } from 'expo-router';

import { FeaturePlaceholderScreen } from '../../shared/components/FeaturePlaceholderScreen';
import { volunteerBottomNavItems, volunteerPlaceholderContent } from '../mockData';

export function VolunteerPlaceholderScreen() {
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const screenKey = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const placeholder =
    (screenKey && volunteerPlaceholderContent[screenKey]) || volunteerPlaceholderContent.profile;

  return (
    <FeaturePlaceholderScreen
      bottomNavItems={volunteerBottomNavItems}
      description={placeholder.description}
      homeHref="/volunteer"
      title={placeholder.title}
    />
  );
}
