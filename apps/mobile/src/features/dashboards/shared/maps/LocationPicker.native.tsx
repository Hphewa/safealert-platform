import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  captureCurrentLocation,
  formatCoordinate,
  type CurrentLocationCaptureResult
} from '../currentLocation';
import { dashboardTheme } from '../theme';
import { LeafletMapWebView } from './LeafletMapWebView.native';
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

type PickerStatus = 'idle' | 'locating' | 'ready' | 'error';

export function LocationPicker({
  value,
  onChange,
  onConfirm,
  onCancel,
  title = 'Adjust Hazard Location',
  instructions = 'Drag the pin or tap the map to place it where the hazard is.'
}: LocationPickerProps) {
  const hasRequestedInitialLocation = useRef(false);
  const [status, setStatus] = useState<PickerStatus>(isValidMapCoordinates(value) ? 'ready' : 'idle');
  const [message, setMessage] = useState<string | null>(
    isValidMapCoordinates(value) ? 'Move the pin if the hazard is somewhere else.' : null
  );
  const [lastMetadata, setLastMetadata] = useState<LocationSelectionMetadata | undefined>();
  const [recenterRequestKey, setRecenterRequestKey] = useState(0);

  useEffect(() => {
    if (isValidMapCoordinates(value)) {
      setStatus('ready');
      return;
    }

    if (hasRequestedInitialLocation.current) {
      return;
    }

    hasRequestedInitialLocation.current = true;
    void useCurrentLocation();
  }, [value]);

  const selectCoordinates = (
    coordinates: MapCoordinates,
    metadata: LocationSelectionMetadata = { source: 'MAP' },
    shouldRecenter = false
  ) => {
    if (!isValidMapCoordinates(coordinates)) {
      setStatus('error');
      setMessage('Choose a valid location before confirming.');
      return;
    }

    setStatus('ready');
    setMessage(metadata.source === 'GPS' ? 'Using your current GPS location.' : 'Selected hazard location updated.');
    setLastMetadata(metadata);
    onChange(coordinates, metadata);

    if (shouldRecenter) {
      setRecenterRequestKey((current) => current + 1);
    }
  };

  const useCurrentLocation = async () => {
    setStatus('locating');
    setMessage('Getting your current location...');

    const result = await captureCurrentLocation({
      permissionDeniedMessage:
        'Location permission is needed to use your current position. You can still choose the hazard location on the map if a location is already selected.',
      locationErrorMessage: 'We could not detect your location. Check location services and try again.'
    });

    handleLocationResult(result);
  };

  const handleLocationResult = (result: CurrentLocationCaptureResult) => {
    if (result.status !== 'DETECTED') {
      setStatus(isValidMapCoordinates(value) ? 'ready' : 'error');
      setMessage(result.errorMessage);
      return;
    }

    selectCoordinates(
      {
        latitude: result.latitude,
        longitude: result.longitude
      },
      {
        accuracyMeters: result.accuracyMeters,
        capturedAt: result.capturedAt,
        source: 'GPS'
      },
      true
    );
  };

  const selectedLocation = isValidMapCoordinates(value) ? value : null;
  const canConfirm = selectedLocation !== null;

  return (
    <View style={styles.container}>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.instructions}>{instructions}</Text>
      </View>

      {selectedLocation ? (
        <LeafletMapWebView
          coordinates={selectedLocation}
          editable
          height={380}
          onLocationChange={(coordinates) => selectCoordinates(coordinates, { source: 'MAP' })}
          recenterRequestKey={recenterRequestKey}
          title="Adjust hazard location map"
        />
      ) : (
        <View style={styles.centeredState}>
          {status === 'locating' ? <ActivityIndicator color={dashboardTheme.colors.primary} size="large" /> : null}
          <Text style={styles.stateText}>{message ?? 'Use your current location to start.'}</Text>
        </View>
      )}

      <View style={styles.summaryPanel}>
        <Text style={styles.summaryTitle}>Selected hazard location</Text>
        {selectedLocation ? (
          <Text style={styles.summaryText}>
            Latitude: {formatCoordinate(selectedLocation.latitude)}
            {'\n'}
            Longitude: {formatCoordinate(selectedLocation.longitude)}
          </Text>
        ) : (
          <Text style={styles.summaryText}>No location selected yet.</Text>
        )}
        {message ? <Text style={[styles.messageText, status === 'error' && styles.errorText]}>{message}</Text> : null}
      </View>

      <Pressable
        accessibilityLabel="Use my current location"
        accessibilityRole="button"
        disabled={status === 'locating'}
        onPress={() => {
          void useCurrentLocation();
        }}
        style={({ pressed }) => [styles.secondaryButton, status === 'locating' && styles.buttonDisabled, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryButtonText}>Use My Current Location</Text>
      </Pressable>

      <View style={styles.actionRow}>
        {onCancel ? (
          <Pressable
            accessibilityLabel="Cancel location adjustment"
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Confirm hazard location"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canConfirm }}
          disabled={!canConfirm}
          onPress={() => {
            if (selectedLocation) {
              onConfirm(selectedLocation, lastMetadata);
            }
          }}
          style={({ pressed }) => [
            styles.confirmButton,
            !canConfirm && styles.confirmButtonDisabled,
            pressed && canConfirm && styles.pressed
          ]}
        >
          <Text style={[styles.confirmButtonText, !canConfirm && styles.confirmButtonTextDisabled]}>
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
  centeredState: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  summaryPanel: {
    gap: 6,
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
  messageText: {
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.muted
  },
  errorText: {
    fontWeight: '700',
    color: dashboardTheme.colors.critical
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
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
  buttonDisabled: {
    opacity: 0.55
  },
  pressed: {
    opacity: 0.82
  }
});
