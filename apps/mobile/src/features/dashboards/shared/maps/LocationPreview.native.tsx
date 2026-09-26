import { StyleSheet, Text, View } from 'react-native';

import { dashboardTheme } from '../theme';
import { LeafletMapWebView } from './LeafletMapWebView.native';
import { isValidMapCoordinates, type MapCoordinates } from './types';

type LocationPreviewProps = {
  coordinates: MapCoordinates | null;
  title?: string;
  height?: number;
};

export function LocationPreview({ coordinates, title = 'Reported Location', height = 210 }: LocationPreviewProps) {
  if (!isValidMapCoordinates(coordinates)) {
    return (
      <View style={[styles.emptyPreview, { minHeight: height }]}>
        <Text style={styles.emptyText}>Reported location is unavailable.</Text>
      </View>
    );
  }

  return <LeafletMapWebView coordinates={coordinates} editable={false} height={height} title={title} />;
}

const styles = StyleSheet.create({
  emptyPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  }
});

