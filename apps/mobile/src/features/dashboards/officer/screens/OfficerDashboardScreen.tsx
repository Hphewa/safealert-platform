import { StyleSheet, View } from 'react-native';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardSection } from '../../shared/components/DashboardSection';
import { officerBottomNavItems } from '../mockData';

export function OfficerDashboardScreen() {
  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems}>
      <DashboardHeader showLogoutButton title="Dashboard" trailingIcon="person-circle-outline" />

      <DashboardSection title="Report Review">
        <View style={styles.grid}>
          <ActionCard
            href="/officer/reports"
            icon="reader-outline"
            subtitle="Open real reports awaiting official review"
            title="Pending Reports"
          />
          <ActionCard
            href="/officer/assessments"
            icon="shield-checkmark-outline"
            subtitle="Continue from verified reports"
            title="Risk Assessments"
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
