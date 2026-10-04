import type { NotificationProfileResponse, UpdateNotificationProfileRequest } from '@safealert/contracts';

import { apiRequest } from '../../../services/api/client';

const profilePath = '/notifications/profile';

export function getNotificationProfile(accessToken: string) {
  return apiRequest<NotificationProfileResponse>(profilePath, { accessToken });
}

/**
 * Updates the authenticated user's own notification contact details. Location values are
 * normalized by the backend so warning scope targeting can match them.
 */
export function updateNotificationProfile(input: UpdateNotificationProfileRequest, accessToken: string) {
  return apiRequest<NotificationProfileResponse>(profilePath, {
    method: 'PUT',
    body: input,
    accessToken
  });
}

/**
 * Registers or refreshes the Firebase Cloud Messaging device token for this account. The
 * backend resolves notification recipients itself, so only the caller's own device token is
 * ever sent.
 */
export function registerPushToken(pushToken: string, accessToken: string) {
  return updateNotificationProfile({ pushToken }, accessToken);
}

/** Removes a stale device token, for example before signing out on a shared device. */
export function clearPushToken(accessToken: string) {
  return updateNotificationProfile({ pushToken: null }, accessToken);
}