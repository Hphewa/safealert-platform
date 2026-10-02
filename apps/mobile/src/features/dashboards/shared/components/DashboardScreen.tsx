import type { ReactElement, ReactNode } from 'react';
import type { RefreshControlProps, StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { BottomNavigation } from './BottomNavigation';
import { DashboardTopBar } from './DashboardTopBar';
import { dashboardTheme } from '../theme';
import type { BottomNavItem } from '../types';

type DashboardScreenProps = {
  children: ReactNode;
  bottomNavItems: BottomNavItem[];
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
};

export function DashboardScreen({
  children,
  bottomNavItems,
  contentContainerStyle,
  refreshControl
}: DashboardScreenProps) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.contentWrap}>
        <DashboardTopBar />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, contentContainerStyle]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          {children}
        </ScrollView>
        <BottomNavigation items={bottomNavItems} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: dashboardTheme.colors.background
  },
  contentWrap: {
    flex: 1,
    backgroundColor: dashboardTheme.colors.background
  },
  scroll: {
    flex: 1
  },
  content: {
    gap: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20
  }
});
