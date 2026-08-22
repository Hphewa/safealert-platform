import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { dashboardTheme, cardShadow } from '../../shared/theme';
import { getFirstName } from '../../shared/utils';
import {
  residentBottomNavItems,
  residentNotificationCount,
  residentPrimaryActions,
  residentWeatherPreview
} from '../mockData';

export function ResidentDashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const firstName = user ? getFirstName(user.name) : 'Resident';
  const [primaryCard, notificationsCard, reportsCard, helpCard] = residentPrimaryActions;

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems}>
      <DashboardHeader
        description="Stay informed. Stay safe."
        subtitle={`Hello, ${firstName}`}
        title="SafeAlert"
        titleAlign="center"
        trailingBadgeCount={residentNotificationCount}
        trailingIcon="notifications-outline"
        onTrailingPress={() => router.push('/resident/alerts')}
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
          href={notificationsCard.href}
          icon={notificationsCard.icon}
          subtitle={notificationsCard.subtitle}
          title={notificationsCard.title}
        />
        <ActionCard
          href={reportsCard.href}
          icon={reportsCard.icon}
          subtitle={reportsCard.subtitle}
          title={reportsCard.title}
        />
      </View>

      <ActionCard
        href={helpCard.href}
        icon={helpCard.icon}
        layout="row"
        subtitle={helpCard.subtitle}
        title={helpCard.title}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(residentWeatherPreview.href)}
        style={({ pressed }) => [styles.weatherCard, pressed && styles.weatherCardPressed]}
      >
        <View style={styles.weatherIconWrap}>
          <DashboardGlyph color={dashboardTheme.colors.info} name="cloudy-rainy-outline" size={20} />
        </View>
        <View style={styles.weatherBody}>
          <Text style={styles.weatherEyebrow}>{residentWeatherPreview.locationLabel}</Text>
          <Text style={styles.weatherTitle}>Weather: {residentWeatherPreview.condition}</Text>
          <Text style={styles.weatherText}>{residentWeatherPreview.advisory}</Text>
        </View>
        <DashboardGlyph color={dashboardTheme.colors.muted} name="chevron-forward" size={20} />
      </Pressable>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  twoColumnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14
  },
  weatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  weatherCardPressed: {
    opacity: 0.82
  },
  weatherIconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  weatherBody: {
    flex: 1,
    gap: 4
  },
  weatherEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
  weatherTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  weatherText: {
    fontSize: 15,
    lineHeight: 21,
    color: dashboardTheme.colors.muted
  }
});
