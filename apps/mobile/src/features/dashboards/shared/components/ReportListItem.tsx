import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from './DashboardGlyph';
import { PriorityBadge } from './PriorityBadge';
import { StatusBadge } from './StatusBadge';
import { cardShadow, dashboardTheme } from '../theme';
import type { Href } from 'expo-router';
import type { DashboardIconName, BadgeTone } from '../types';
import type { RiskLevel } from '@safealert/contracts';

type ReportListItemProps = {
  title: string;
  subtitle: ReactNode;
  icon: DashboardIconName;
  href: Href;
  timeLabel?: string;
  detailItems?: string[];
  severity?: RiskLevel;
  statusLabel?: string;
  statusTone?: BadgeTone;
};

export function ReportListItem({
  title,
  subtitle,
  icon,
  href,
  timeLabel,
  detailItems,
  severity,
  statusLabel,
  statusTone
}: ReportListItemProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.header}>
        {severity ? <PriorityBadge priority={severity} /> : null}
        {!severity && statusLabel && statusTone ? (
          <StatusBadge label={statusLabel} tone={statusTone} />
        ) : null}
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
      </View>
      <View style={styles.mainRow}>
        <View style={styles.iconWrap}>
          <DashboardGlyph color={dashboardTheme.colors.info} name={icon} size={20} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {detailItems?.length ? (
            <View style={styles.detailsRow}>
              {detailItems.map((item) => (
                <Text key={item} style={styles.detailText}>
                  {item}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        <DashboardGlyph color={dashboardTheme.colors.muted} name="chevron-forward" size={20} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  cardPressed: {
    opacity: 0.82
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  time: {
    marginLeft: 'auto',
    fontSize: 13,
    fontWeight: '600',
    color: dashboardTheme.colors.muted
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  iconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  body: {
    flex: 1,
    gap: 4
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  subtitle: {
    fontSize: 16,
    color: dashboardTheme.colors.text
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4
  },
  detailText: {
    fontSize: 14,
    color: dashboardTheme.colors.muted
  }
});
