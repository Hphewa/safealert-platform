import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { dashboardTheme } from '../../shared/theme';
import type { ReportLocationCoordinates, ReportMapRegion } from '../reportLocation';

const webAdjustmentStep = 0.0005;

type ReportLocationMapProps = {
  location: ReportLocationCoordinates;
  region: ReportMapRegion;
  onChange: (coordinates: ReportLocationCoordinates) => void;
  onRegionChange: (region: ReportMapRegion) => void;
};

export function ReportLocationMap({
  location,
  region,
  onChange,
  onRegionChange
}: ReportLocationMapProps) {
  const moveLocation = (latitudeDelta: number, longitudeDelta: number) => {
    const nextLocation = {
      latitude: location.latitude + latitudeDelta,
      longitude: location.longitude + longitudeDelta
    };

    onChange(nextLocation);
    onRegionChange({
      ...region,
      ...nextLocation
    });
  };

  return (
    <View style={styles.webSelector}>
      <View style={styles.webPin}>
        <DashboardGlyph color="#ffffff" name="locate-outline" size={22} />
      </View>
      <Text style={styles.webSelectorTitle}>Selected incident position</Text>
      <Text style={styles.panelText}>Use these controls while testing in the browser.</Text>
      <View style={styles.webControlGrid}>
        <View style={styles.webControlSpacer} />
        <WebMoveButton label="North" onPress={() => moveLocation(webAdjustmentStep, 0)} />
        <View style={styles.webControlSpacer} />
        <WebMoveButton label="West" onPress={() => moveLocation(0, -webAdjustmentStep)} />
        <View style={styles.webControlCenter} />
        <WebMoveButton label="East" onPress={() => moveLocation(0, webAdjustmentStep)} />
        <View style={styles.webControlSpacer} />
        <WebMoveButton label="South" onPress={() => moveLocation(-webAdjustmentStep, 0)} />
        <View style={styles.webControlSpacer} />
      </View>
    </View>
  );
}

function WebMoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`Move selected location ${label.toLowerCase()}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.webMoveButton, pressed && styles.pressed]}
    >
      <Text style={styles.webMoveButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  webSelector: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20
  },
  webPin: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: dashboardTheme.colors.primary
  },
  webSelectorTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  panelText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  webControlGrid: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  webControlSpacer: {
    width: '30%',
    minHeight: 44
  },
  webControlCenter: {
    width: '30%',
    minHeight: 44,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  webMoveButton: {
    width: '30%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  webMoveButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  pressed: {
    opacity: 0.82
  }
});
