import { StyleSheet, View } from 'react-native';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardSection } from '../../shared/components/DashboardSection';
import { ReportListItem } from '../../shared/components/ReportListItem';
import { StatCard } from '../../shared/components/StatCard';
import {
  officerBottomNavItems,
  officerLatestReports,
  officerQuickActions,
  officerSummaryStats
} from '../mockData';

export function OfficerDashboardScreen() {
  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems}>
      <DashboardHeader showLogoutButton title="Dashboard" trailingIcon="person-circle-outline" />

      <View style={styles.grid}>
        {officerSummaryStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </View>

      <DashboardSection actionHref="/officer/reports" actionLabel="View All" title="Latest Reports">
        <View style={styles.list}>
          {officerLatestReports.map((report) => (
            <ReportListItem
              href={report.href}
              icon={report.icon}
              key={report.id}
              subtitle={report.subtitle}
              timeLabel={report.timeLabel}
              title={report.title}
            />
          ))}
        </View>
      </DashboardSection>

      <DashboardSection title="Quick Actions">
        <View style={styles.grid}>
          {officerQuickActions.map((action) => (
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
