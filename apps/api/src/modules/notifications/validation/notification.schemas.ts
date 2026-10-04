import { z } from 'zod';
import { NOTIFICATION_PROFILE_FIELD_LIMITS, WARNING_DISTRICTS, NOTIFICATION_COUNTRY, normalizeNotificationLocation } from '@safealert/contracts';
import { toNotifyLkRecipient } from '../utils/phoneNumber.js';

const optionalField = (max: number) => z.string().trim().max(max).nullable().optional();

/**
 * Strict own-profile schema. Only the authenticated user's own notification contact fields
 * can be changed; role, identifiers and timestamps are rejected.
 * An empty string or null clears the stored value.
 */
export const updateNotificationProfileSchema = z.object({
  area: optionalField(NOTIFICATION_PROFILE_FIELD_LIMITS.area),
  district: optionalField(NOTIFICATION_PROFILE_FIELD_LIMITS.district).refine(value => !value || WARNING_DISTRICTS.some(district => normalizeNotificationLocation(district) === normalizeNotificationLocation(value)), 'Select a valid district.'),
  country: optionalField(NOTIFICATION_PROFILE_FIELD_LIMITS.country).refine(value => !value || normalizeNotificationLocation(value) === normalizeNotificationLocation(NOTIFICATION_COUNTRY), 'Country must be Sri Lanka.'),
  phoneNumber: optionalField(NOTIFICATION_PROFILE_FIELD_LIMITS.phoneNumber)
    .refine((value) => value === undefined || value === null || value === '' || toNotifyLkRecipient(value) !== null, {
      message: 'Enter a valid Sri Lankan mobile number such as 0771234567.'
    }),
  pushToken: optionalField(NOTIFICATION_PROFILE_FIELD_LIMITS.pushToken).refine(value => !value || (!/^(ExponentPushToken|ExpoPushToken)\[/.test(value) && !/\s/.test(value)), 'A native FCM token is required.')
}).strict();
