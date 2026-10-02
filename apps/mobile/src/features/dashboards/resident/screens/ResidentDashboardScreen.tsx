import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { getFirstName } from '../../shared/utils';
import { residentBottomNavItems, residentPrimaryActions } from '../mockData';

export function ResidentDashboardScreen() {
  const { user } = useAuth();
  const firstName = user ? getFirstName(user.name) : 'Resident';
  const [primaryCard, reportsCard, helpCard] = residentPrimaryActions;

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems}>
      <DashboardHeader
        description="Stay informed. Stay safe."
        subtitle={`Hello, ${firstName}`}
        title="SafeAlert"
        titleAlign="center"
        showLogoutButton
      />

      <ActionCard
        href={primaryCard.href}
        icon={primaryCard.icon}
        layout="row"
        subtitle={primaryCard.subtitle}
        title={primaryCard.title}
        variant="primary"
      />

      <View style={styles.twoColumnGrid}>
        <ActionCard
          href={reportsCard.href}
          icon={reportsCard.icon}
          subtitle={reportsCard.subtitle}
          title={reportsCard.title}
        />
        <ActionCard
          href={helpCard.href}
          icon={helpCard.icon}
          subtitle={helpCard.subtitle}
          title={helpCard.title}
        />
      </View>
      <ActionCard title="View Risk Areas" subtitle="See current assessed risks and warning availability" href="/resident/risk-map" icon="map-outline" layout="row" />
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  twoColumnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14
  }
});
