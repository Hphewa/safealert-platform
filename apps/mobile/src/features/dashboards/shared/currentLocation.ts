import * as Location from 'expo-location';

export type CurrentLocationCaptureResult =
  | {
      status: 'DETECTED';
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      capturedAt: string;
      errorMessage: null;
    }
  | {
      status: 'PERMISSION_DENIED' | 'ERROR';
      latitude: null;
      longitude: null;
      accuracyMeters: null;
      capturedAt: null;
      errorMessage: string;
    };

type CaptureCurrentLocationOptions = {
  permissionDeniedMessage: string;
  locationErrorMessage: string;
  onLocating?: () => void;
};

export async function captureCurrentLocation({
  permissionDeniedMessage,
  locationErrorMessage,
  onLocating
}: CaptureCurrentLocationOptions): Promise<CurrentLocationCaptureResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== Location.PermissionStatus.GRANTED) {
      return {
        status: 'PERMISSION_DENIED',
        latitude: null,
        longitude: null,
        accuracyMeters: null,
        capturedAt: null,
        errorMessage: permissionDeniedMessage
      };
    }

    onLocating?.();

    const currentLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });

    return {
      status: 'DETECTED',
      latitude: currentLocation.coords.latitude,
      longitude: currentLocation.coords.longitude,
      accuracyMeters: currentLocation.coords.accuracy ?? null,
      capturedAt: new Date(currentLocation.timestamp).toISOString(),
      errorMessage: null
    };
  } catch {
    return {
      status: 'ERROR',
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      capturedAt: null,
      errorMessage: locationErrorMessage
    };
  }
}

export function formatCoordinate(value: number) {
  return value.toFixed(6);
}
