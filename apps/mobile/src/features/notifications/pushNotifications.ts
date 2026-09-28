export type ExpoDevicePushToken = {
  type?: unknown;
  data?: unknown;
};

/**
 * Extracts the Firebase Cloud Messaging registration token from the device token returned by
 * the Expo notifications API.
 *
 * This helper is intentionally dependency-free. SafeAlert keeps Expo Go SDK 57 compatibility,
 * and remote push notifications require `expo-notifications` plus a development build, so the
 * module is loaded by the screen that owns device registration:
 *
 *   const deviceToken = await Notifications.getDevicePushTokenAsync();
 *   const token = readDevicePushToken(deviceToken);
 *
 * Returns null when the device token is missing, empty, or not a string, so an undeliverable
 * token is never registered against an account.
 */
export function readDevicePushToken(deviceToken: ExpoDevicePushToken | null | undefined): string | null {
  if (!deviceToken || typeof deviceToken.data !== 'string') return null;

  const token = deviceToken.data.trim();

  return token.length > 0 ? token : null;
}