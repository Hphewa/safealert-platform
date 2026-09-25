import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNavigation } from './BottomNavigation';
import { dashboardTheme } from '../theme';
import type { BottomNavItem } from '../types';

type DashboardScreenProps = {
  children: ReactNode;
  bottomNavItems: BottomNavItem[];
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function DashboardScreen({
  children,
  bottomNavItems,
  contentContainerStyle
}: DashboardScreenProps) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.contentWrap}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
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
  content: {
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20
  }
});
