import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from './DashboardGlyph';
import { dashboardTheme } from '../theme';
import type { Href } from 'expo-router';

type DashboardSectionProps = {
  title: string;
  actionLabel?: string;
  actionHref?: Href;
  children: React.ReactNode;
};

export function DashboardSection({
  title,
  actionLabel,
  actionHref,
  children
}: DashboardSectionProps) {
  const router = useRouter();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {actionLabel && actionHref ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(actionHref)}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
            <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="chevron-forward" size={16} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  actionPressed: {
    opacity: 0.82
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  }
});
