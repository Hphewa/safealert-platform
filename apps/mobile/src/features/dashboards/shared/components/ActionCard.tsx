import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from './DashboardGlyph';
import { cardShadow, dashboardTheme } from '../theme';
import type { Href } from 'expo-router';
import type { DashboardIconName } from '../types';

type ActionCardProps = {
  title: string;
  subtitle?: string;
  href: Href;
  icon: DashboardIconName;
  layout?: 'row' | 'column';
  variant?: 'default' | 'primary';
};

export function ActionCard({
  title,
  subtitle,
  href,
  icon,
  layout = 'column',
  variant = 'default'
}: ActionCardProps) {
  const router = useRouter();
  const isRow = layout === 'row';
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.card,
        isRow ? styles.cardRow : styles.cardColumn,
        isPrimary ? styles.cardPrimary : styles.cardDefault,
        pressed && styles.cardPressed
      ]}
    >
      <View style={[styles.iconWrap, isPrimary && styles.iconWrapPrimary]}>
        <DashboardGlyph
          color={isPrimary ? dashboardTheme.colors.primaryStrong : dashboardTheme.colors.info}
          name={icon}
          size={isRow ? 24 : 20}
        />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <DashboardGlyph color={dashboardTheme.colors.muted} name="chevron-forward" size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 120,
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  cardColumn: {
    flex: 1
  },
  cardDefault: {
    backgroundColor: dashboardTheme.colors.surface
  },
  cardPrimary: {
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  cardPressed: {
    opacity: 0.82
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  iconWrapPrimary: {
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  body: {
    flex: 1,
    gap: 6
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted
  }
});
