import type {
  NotificationProfileResponse,
  UpdateNotificationProfileRequest
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { NotificationProfilePatch, NotificationProfileRepository } from '../repositories/notificationProfile.repository.js';
import { normalizeLocationValue } from '../utils/normalizeLocationValue.js';
import { toNotifyLkRecipient } from '../utils/phoneNumber.js';

const locationFields = ['area', 'district', 'country'] as const;

/**
 * Own-profile notification contact details. Location values are stored normalized so the
 * same value can be matched by warning scope targeting. An empty value or null clears the
 * stored field, which lets a device unregister a stale push token.
 */
export class NotificationProfileService {
  constructor(private readonly profiles: NotificationProfileRepository) {}

  async get(userId: string): Promise<NotificationProfileResponse> {
    const profile = await this.profiles.findProfile(userId);

    if (!profile) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');

    return { profile };
  }

  async update(userId: string, input: UpdateNotificationProfileRequest): Promise<NotificationProfileResponse> {
    const patch: NotificationProfilePatch = {};

    for (const field of locationFields) {
      const value = input[field];

      if (value !== undefined) {
        patch[field] = value === null ? null : normalizeLocationValue(value);
      }
    }

    if (input.phoneNumber !== undefined) {
      const phoneNumber = input.phoneNumber?.trim();
      patch.phoneNumber = phoneNumber ? toNotifyLkRecipient(phoneNumber) : null;
    }

    if (input.pushToken !== undefined) {
      const pushToken = input.pushToken?.trim();
      patch.pushToken = pushToken ? pushToken : null;
    }

    const profile = await this.profiles.updateProfile(userId, patch);

    if (!profile) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');

    return { profile };
  }
}
