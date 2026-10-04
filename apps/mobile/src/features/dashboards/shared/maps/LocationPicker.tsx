import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { dashboardTheme } from '../theme';
import {
  isValidMapCoordinates,
  type LocationSelectionMetadata,
  type MapCoordinates
} from './types';

type LocationPickerProps = {
  value: MapCoordinates | null;
  onChange: (coordinates: MapCoordinates, metadata?: LocationSelectionMetadata) => void;
  onConfirm: (coordinates: MapCoordinates, metadata?: LocationSelectionMetadata) => void;
  onCancel?: () => void;
  title?: string;
  instructions?: string;
};

export function LocationPicker({
  value,
  onChange,
  onConfirm,
  onCancel,
  title = 'Adjust Hazard Location',
  instructions = ''
}: LocationPickerProps) {
  const selectedLocation = isValidMapCoordinates(value) ? value : null;
  const latitudeText = selectedLocation ? String(selectedLocation.latitude) : '';
  const longitudeText = selectedLocation ? String(selectedLocation.longitude) : '';

  const updateLatitude = (latitude: string) => {
    const nextLatitude = Number(latitude);
    const longitude = selectedLocation?.longitude ?? 0;
    const next = { latitude: nextLatitude, longitude };

    if (isValidMapCoordinates(next)) {
      onChange(next, { source: 'MAP' });
    }
  };

  const updateLongitude = (longitude: string) => {
    const latitude = selectedLocation?.latitude ?? 0;
    const nextLongitude = Number(longitude);
    const next = { latitude, longitude: nextLongitude };

    if (isValidMapCoordinates(next)) {
      onChange(next, { source: 'MAP' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{title}</Text>
        {instructions ? <Text style={styles.instructions}>{instructions}</Text> : null}
      </View>
      <View style={styles.fallbackPanel}>
        <Text style={styles.summaryTitle}>Selected hazard location</Text>
        <Text style={styles.summaryText}>
          {selectedLocation ? 'Location selected on the map.' : 'Select a location on the map.'}
        </Text>
        <TextInput
          accessibilityLabel="Latitude"
          keyboardType="decimal-pad"
          onChangeText={updateLatitude}
          placeholder="Latitude"
          placeholderTextColor={dashboardTheme.colors.muted}
          style={styles.input}
          value={latitudeText}
        />
        <TextInput
          accessibilityLabel="Longitude"
          keyboardType="decimal-pad"
          onChangeText={updateLongitude}
          placeholder="Longitude"
          placeholderTextColor={dashboardTheme.colors.muted}
          style={styles.input}
          value={longitudeText}
        />
      </View>
      <View style={styles.actionRow}>
        {onCancel ? (
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !selectedLocation }}
          disabled={!selectedLocation}
          onPress={() => {
            if (selectedLocation) {
              onConfirm(selectedLocation, { source: 'MAP' });
            }
          }}
          style={({ pressed }) => [
            styles.confirmButton,
            !selectedLocation && styles.confirmButtonDisabled,
            pressed && selectedLocation && styles.pressed
          ]}
        >
          <Text style={[styles.confirmButtonText, !selectedLocation && styles.confirmButtonTextDisabled]}>
            Confirm Location
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14
  },
  copyBlock: {
    gap: 6
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  instructions: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  fallbackPanel: {
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.text
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    color: dashboardTheme.colors.text
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12
  },
  cancelButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  confirmButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  confirmButtonDisabled: {
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff'
  },
  confirmButtonTextDisabled: {
    color: dashboardTheme.colors.muted
  },
  pressed: {
    opacity: 0.82
  }
});
