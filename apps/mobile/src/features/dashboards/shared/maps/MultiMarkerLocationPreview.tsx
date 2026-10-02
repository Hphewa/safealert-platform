import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dashboardTheme } from '../theme';
import { formatMapCoordinate, isValidMapCoordinates } from './types';
import type { MultiMarkerLocationPreviewProps } from './multiMarkerHtml';
export type { MultiMarkerLocation } from './multiMarkerHtml';

export function MultiMarkerLocationPreview({ locations, height = 260, onMarkerSelect }: MultiMarkerLocationPreviewProps) {
  const validLocations = locations.filter(isValidMapCoordinates);
  return <View style={[styles.fallback, { maxHeight: height }]}>
    <Text style={styles.title}>{onMarkerSelect ? 'Risk locations · list view' : 'Reported locations'}</Text>
    {onMarkerSelect ? <Text>Interactive geographic maps are available in the mobile app.</Text> : null}
    <ScrollView>
      {validLocations.map((location) => <Pressable key={location.id} accessibilityRole={onMarkerSelect ? 'button' : undefined}
        onPress={() => onMarkerSelect?.(location.id)} style={styles.row}>
        <Text style={styles.locationText}>{location.label ?? 'Report'}: {formatMapCoordinate(location.latitude)}, {formatMapCoordinate(location.longitude)}</Text>
      </Pressable>)}
      {!validLocations.length ? <Text>Reported locations are unavailable.</Text> : null}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  fallback: { gap: 8, padding: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surfaceMuted },
  title: { fontSize: 15, fontWeight: '800', color: dashboardTheme.colors.text },
  row: { paddingVertical: 12 }, locationText: { fontSize: 13, lineHeight: 19, color: dashboardTheme.colors.muted }
});
