import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardSection } from '../../shared/components/DashboardSection';
import { getFirstName } from '../../shared/utils';
import { volunteerBottomNavItems } from '../mockData';

export function VolunteerDashboardScreen() {
  const { user } = useAuth();
  const firstName = user ? getFirstName(user.name) : 'Volunteer';

  return (
    <DashboardScreen bottomNavItems={volunteerBottomNavItems}>
      <DashboardHeader
        description="Help verify conditions in your community."
        showLogoutButton
        subtitle={`Hello, ${firstName}`}
        title="Volunteer Dashboard"
      />

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
