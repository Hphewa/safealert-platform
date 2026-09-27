import { useLocalSearchParams } from 'expo-router';

import { FeaturePlaceholderScreen } from '../../shared/components/FeaturePlaceholderScreen';
import { residentBottomNavItems } from '../mockData';

export function ResidentPlaceholderScreen() {
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const screenKey = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const title = screenKey ? 'Resident Feature' : 'Resident';

  return (
    <FeaturePlaceholderScreen
      bottomNavItems={residentBottomNavItems}
      description="Open Report Hazard, My Reports, or Help from the navigation below."
      homeHref="/resident"
      title={title}
    />
  );
}
