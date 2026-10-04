import { Linking, Platform } from 'react-native';

export type EmergencyCoordinates = {
  latitude: number | null;
  longitude: number | null;
  isValid: boolean;
};

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

export function extractEmergencyCoordinates(location: unknown): EmergencyCoordinates {
  if (!location || typeof location !== 'object' || !('type' in location) || location.type !== 'Point'
    || !('coordinates' in location) || !Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
    return { latitude: null, longitude: null, isValid: false };
  }

  // GeoJSON stores [longitude, latitude]; external maps expect latitude first.
  // Do not coerce missing/string values into a plausible but incorrect destination.
  const [longitude, latitude] = location.coordinates;
  if (!isCoordinate(latitude, 90) || !isCoordinate(longitude, 180)) {
    return { latitude: null, longitude: null, isValid: false };
  }
  return { latitude, longitude, isValid: true };
}

export function formatCoordinate(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Not provided';
}

export function isValidPhoneNumber(phoneNumber: unknown): phoneNumber is string {
  if (typeof phoneNumber !== 'string') return false;
  const trimmed = phoneNumber.trim();
  // Accept ordinary phone formatting, but never URI parameters, letters or dial codes.
  // Seven digits matches the existing resident phone form's minimum.
  return trimmed.length <= 32 && /^\+?[\d(][\d\s().-]*$/.test(trimmed)
    && trimmed.replace(/\D/g, '').length >= 7;
}

export function formatTelUrl(phoneNumber: unknown): string | null {
  if (!isValidPhoneNumber(phoneNumber)) return null;
  return `tel:${phoneNumber.trim().replace(/[\s().-]/g, '')}`;
}

export async function initiateResidentCall(phoneNumber: unknown): Promise<boolean> {
  const url = formatTelUrl(phoneNumber);
  return url ? openExternalUrl(url) : false;
}

export async function initiateViewLocationRoute(latitude: unknown, longitude: unknown): Promise<boolean> {
  // Revalidate at the action boundary as cached request data may be incomplete.
  if (!isCoordinate(latitude, 90) || !isCoordinate(longitude, 180)) return false;
  const destination = encodeURIComponent(`${latitude},${longitude}`);
  // Universal HTTPS directions work with a maps app or browser, without an SDK/key.
  // Leave origin/travel mode to the responder and the map application's capabilities.
  return openExternalUrl(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
}

async function openExternalUrl(url: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && url.startsWith('https:')) {
      // Open synchronously inside the tap: awaiting a capability query can lose the
      // browser's user activation. RN Web Linking also hides blocked-popup results.
      if (typeof window === 'undefined') return false;
      const mapWindow = window.open(url, '_blank');
      if (!mapWindow) return false;
      mapWindow.opener = null;
      return true;
    }
    // Native canOpenURL may return false because of Android/iOS query restrictions.
    // Attempt the safe URL directly; openURL rejects when no handler can open it.
    // On web, Linking delegates tel: to the browser's registered telephone handler.
    await Linking.openURL(url);
    return true;
  } catch {
    // Return failure to the screen so it can show actionable, nontechnical feedback.
    return false;
  }
}
