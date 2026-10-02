import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardSection } from '../../shared/components/DashboardSection';
import { getFirstName } from '../../shared/utils';
import { RoleStatusBanner } from '../../shared/components/RoleStatusBanner';
import { dashboardTheme } from '../../shared/theme';
import { volunteerBottomNavItems } from '../mockData';

export function VolunteerDashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const firstName = user ? getFirstName(user.name) : 'Volunteer';

  return (
    <DashboardScreen bottomNavItems={volunteerBottomNavItems}>
      <DashboardHeader
        roleLabel="COMMUNITY OPERATIONS"
        accentColor={dashboardTheme.colors.teal}
        description="Help verify conditions in your community."
        showLogoutButton
        subtitle={`Hello, ${firstName}`}
        title="Volunteer Dashboard"
        trailingIcon="person-circle-outline"
        trailingProfile
        trailingAccessibilityLabel="Open volunteer profile"
        onTrailingPress={() => router.push('/volunteer/profile')}
      />

      <RoleStatusBanner title="Field verification" message="Your local observations help officers confirm what is happening on the ground." tone="success" icon="locate-outline" />

      <DashboardSection title="Report Verification">
        <View style={styles.grid}>
          <ActionCard
            href="/volunteer/nearby"
            icon="locate-outline"
            subtitle="Open real incoming and nearby reports"
            title="Community Reports"
          />
          <ActionCard
            href="/volunteer/confirmations"
            icon="checkmark-done-outline"
            subtitle="Review field checks you submitted"
            title="My Confirmations"
          />
        </View>
      </DashboardSection>
      <ActionCard title="Risk Locations" subtitle="View current assessed risks in your community" href="/volunteer/risk-map" icon="map-outline" layout="row" />
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14
  }
});
