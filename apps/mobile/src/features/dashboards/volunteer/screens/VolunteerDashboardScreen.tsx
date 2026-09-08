import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardSection } from '../../shared/components/DashboardSection';
import { ReportListItem } from '../../shared/components/ReportListItem';
import { StatCard } from '../../shared/components/StatCard';
import { getFirstName } from '../../shared/utils';
import {
  volunteerBottomNavItems,
  volunteerNearbyReports,
  volunteerQuickActions,
  volunteerSummaryStats
} from '../mockData';

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

      <View style={styles.grid}>
        {volunteerSummaryStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </View>

      <DashboardSection title="Nearby Reports">
        <View style={styles.list}>
          {volunteerNearbyReports.map((report) => (
            <ReportListItem
              detailItems={report.detailItems}
              href={report.href}
              icon={report.icon}
              key={report.id}
              severity={report.severity}
              subtitle={report.subtitle}
              title={report.title}
            />
          ))}
        </View>
      </DashboardSection>

      <DashboardSection title="Quick Actions">
        <View style={styles.grid}>
          {volunteerQuickActions.map((action) => (
            <ActionCard
              href={action.href}
              icon={action.icon}
              key={action.title}
              subtitle={action.subtitle}
              title={action.title}
            />
          ))}
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
  },
  list: {
    gap: 12
  }
});
