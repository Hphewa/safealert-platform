import { StyleSheet, Text, View } from 'react-native';

import { dashboardTheme } from '../../shared/theme';

type VolunteerReportDetailItemProps = {
  label: string;
  value: string;
};

export function VolunteerReportDetailItem({ label, value }: VolunteerReportDetailItemProps) {
  return (
    <View style={styles.item}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flex: 1,
    minWidth: 140,
    gap: 6
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: dashboardTheme.colors.muted
  },
  value: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  }
});
