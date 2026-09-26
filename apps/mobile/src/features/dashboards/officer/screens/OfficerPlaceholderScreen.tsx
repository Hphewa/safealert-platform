import { useLocalSearchParams } from 'expo-router';

import { FeaturePlaceholderScreen } from '../../shared/components/FeaturePlaceholderScreen';
import type { PlaceholderConfig } from '../../shared/types';
import { officerBottomNavItems } from '../officerNavigation';

const officerPlaceholderContent: Record<string, PlaceholderConfig> = {
  monitoring: {
    title: 'Monitoring',
    description: 'Incident monitoring dashboards and live feeds will appear here soon.'
  },
  profile: {
    title: 'Officer Profile',
    description: 'Officer account preferences and profile settings will live here soon.'
  }
};

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
