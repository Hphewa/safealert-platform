import { StyleSheet, Text, View } from 'react-native';

import { dashboardTheme } from '../theme';
import { formatMapCoordinate, type MapCoordinates } from './types';

export type MultiMarkerLocation = MapCoordinates & {
  id: string;
  label?: string;
};

type MultiMarkerLocationPreviewProps = {
  locations: MultiMarkerLocation[];
  height?: number;
};

export function MultiMarkerLocationPreview({ locations }: MultiMarkerLocationPreviewProps) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.title}>Reported locations</Text>
      {locations.map((location) => (
        <Text key={location.id} style={styles.locationText}>
          {location.label ?? 'Report'}: {formatMapCoordinate(location.latitude)}, {formatMapCoordinate(location.longitude)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  locationText: {
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.muted
  }
});

