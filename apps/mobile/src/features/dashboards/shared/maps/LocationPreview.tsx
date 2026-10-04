import { StyleSheet, Text, View } from 'react-native';

import { dashboardTheme } from '../theme';
import { isValidMapCoordinates, type MapCoordinates } from './types';

type LocationPreviewProps = {
  coordinates: MapCoordinates | null;
  title?: string;
  height?: number;
  placeName?: string;
};

export function LocationPreview({ coordinates, title = 'Reported Location', height = 180, placeName }: LocationPreviewProps) {
  return (
    <View style={[styles.previewFrame, { minHeight: height }]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {isValidMapCoordinates(coordinates) ? (
        <Text style={styles.coordinateText}>{placeName ?? 'Location selected on the map.'}</Text>
      ) : (
        <Text style={styles.coordinateText}>Reported location is unavailable.</Text>
      )}
      <Text style={styles.hintText}>Map preview is available when testing in Expo Go.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  previewFrame: {
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  coordinateText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.text
  },
  hintText: {
    fontSize: 12,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
  }
});
