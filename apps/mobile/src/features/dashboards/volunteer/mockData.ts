import type { BottomNavItem, PlaceholderConfig } from '../shared/types';

export const volunteerBottomNavItems: BottomNavItem[] = [
  { label: 'Home', href: '/volunteer', icon: 'home-outline' },
  { label: 'Reports', href: '/volunteer/nearby', icon: 'locate-outline' },
  { label: 'Confirmations', href: '/volunteer/confirmations', icon: 'checkmark-done-outline' }
];

export const volunteerPlaceholderContent: Record<string, PlaceholderConfig> = {
  nearby: {
    title: 'Community Reports',
    description: 'Open Community Reports to view real reports available for field confirmation.'
  },
  confirmations: {
    title: 'My Confirmations',
    description: 'Open My Confirmations to review submitted field checks.'
  }
};
