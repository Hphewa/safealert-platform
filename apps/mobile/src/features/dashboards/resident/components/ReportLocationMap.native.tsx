import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';

import { dashboardTheme } from '../../shared/theme';
import type { ReportLocationCoordinates, ReportMapRegion } from '../reportLocation';

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
  return (
    <View style={styles.container}>
      <MapView
        initialRegion={region}
        loadingBackgroundColor={dashboardTheme.colors.surfaceMuted}
        loadingEnabled
        loadingIndicatorColor={dashboardTheme.colors.primary}
        mapType="standard"
        moveOnMarkerPress={false}
        onPress={(event: MapPressEvent) => {
          onChange(event.nativeEvent.coordinate);
        }}
        onRegionChangeComplete={onRegionChange}
        provider={PROVIDER_GOOGLE}
        showsCompass
        showsMyLocationButton
        showsUserLocation
        style={styles.map}
      >
        <Marker
          coordinate={location}
          draggable
          onDragEnd={(event) => {
            onChange(event.nativeEvent.coordinate);
          }}
          pinColor={dashboardTheme.colors.primary}
          title="Selected hazard location"
        />
      </MapView>
      <View pointerEvents="none" style={styles.selectionHint}>
        <Text style={styles.selectionHintText}>Drag the pin or tap the map to adjust</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 360
  },
  map: {
    width: '100%',
    height: 360
  },
  selectionHint: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.76)'
  },
  selectionHintText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff'
  }
});
