import { Linking } from 'react-native';
import type { GeoJsonPoint } from '@safealert/contracts';

export type EmergencyCoordinates = {
  latitude: number | null;
  longitude: number | null;
  isValid: boolean;
};

// Reuse the GPS coordinates submitted with the emergency request
// so responders can act on the original emergency location.
// GeoJSON specifications define Point coordinates in [longitude, latitude] order.
// This helper extracts them into distinct, strongly typed latitude and longitude
// values, strictly validating numeric boundaries to prevent malformed or corrupted
// coordinate data from breaking the responder mobile UI.
export function extractEmergencyCoordinates(
  location: GeoJsonPoint | null | undefined
): EmergencyCoordinates {
  if (!location || !Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
    return { latitude: null, longitude: null, isValid: false };
  }

  // GeoJSON Point specifications store coordinates in [longitude, latitude] order
  const [longitude, latitude] = location.coordinates;

  // Defensive validation: ensure coordinate components are finite numbers within
  // standard WGS-84 geographic coordinate limits (-90 to +90 for latitude,
  // -180 to +180 for longitude) before presenting them to the responder.
  const isLatValid =
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90;

  const isLonValid =
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180;

  if (!isLatValid || !isLonValid) {
    return { latitude: null, longitude: null, isValid: false };
  }

  return {
    latitude,
    longitude,
    isValid: true
  };
}

// Format coordinate numbers safely for presentation to responders.
// Ensures missing, NaN, or non-finite values never display as 'undefined' or 'NaN'
// on the responder emergency details screen.
export function formatCoordinate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Not provided';
  }
  return String(value);
}

// Validate the saved Resident contact number before invoking
// the device dialer so malformed request data cannot trigger
// an invalid external action.
// Enforces non-empty string, rejects literal placeholder strings,
// and ensures dialable numeric digits are present.
export function isValidPhoneNumber(phoneNumber: string | null | undefined): phoneNumber is string {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }

  const trimmed = phoneNumber.trim();
  if (
    trimmed.length === 0 ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed === 'NaN'
  ) {
    return false;
  }

  // Ensure there are usable numeric digits for the device dialer
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 3;
}

// Sanitize telephone URL to ensure proper scheme format without malformed spaces or unsafe characters
export function formatTelUrl(phoneNumber: string): string {
  // Strip whitespace while preserving leading plus and dial characters
  const sanitized = phoneNumber.trim().replace(/\s+/g, '');
  return `tel:${sanitized}`;
}

// Initiate contact with the resident using the native mobile dialer.
// Uses React Native Linking with tel: URI scheme to delegate the call to the
// user's telephony app without creating an in-app calling stack.
export async function initiateResidentCall(
  phoneNumber: string | null | undefined
): Promise<boolean> {
  // Validate the saved Resident contact number before invoking
  // the device dialer so malformed request data cannot trigger
  // an invalid external action.
  if (!isValidPhoneNumber(phoneNumber)) {
    return false;
  }

  const telUrl = formatTelUrl(phoneNumber);

  // Guard against environments where Linking is unavailable or in unit tests
  if (typeof Linking === 'undefined' || typeof Linking.openURL !== 'function') {
    return false;
  }

  try {
    // If canOpenURL is supported, check compatibility prior to invocation
    if (typeof Linking.canOpenURL === 'function') {
      const supported = await Linking.canOpenURL(telUrl);
      if (supported) {
        await Linking.openURL(telUrl);
        return true;
      }
    }
    // Attempt direct dispatch for environments where canOpenURL may return false for tel schemes
    await Linking.openURL(telUrl);
    return true;
  } catch {
    // Defensively absorb dialer errors (e.g., simulators or devices without SIM) to prevent app crashes
    return false;
  }
}

// LDFEW-365: Action handler for viewing emergency location or planning response route.
// Validates coordinates to ensure the responder action operates on genuine emergency data,
// and wires the real latitude/longitude ready for LDFEW-367 external map launching.
export function initiateViewLocationRoute(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean {
  // Reuse the GPS coordinates submitted with the emergency request
  // so responders can act on the original emergency location.
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return false;
  }

  // Coordinates are validated and ready for external mobile/map capability in LDFEW-367
  return true;
}
