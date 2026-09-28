import type { NotificationProfile } from '@safealert/contracts';
import { UserModel, type UserDocument } from '../../users/models/user.model.js';
import type { NotificationProfilePatch, NotificationProfileRepository } from './notificationProfile.repository.js';

/** Only fields the user actually set are returned; the push token is never in auth responses. */
export function toNotificationProfile(user: UserDocument): NotificationProfile {
  return {
    ...(user.area ? { area: user.area } : {}),
    ...(user.district ? { district: user.district } : {}),
    ...(user.country ? { country: user.country } : {}),
    ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
    ...(user.pushToken ? { pushToken: user.pushToken } : {})
  };
}

export class MongooseNotificationProfileRepository implements NotificationProfileRepository {
  async findProfile(userId: string) {
    const user = await UserModel.findById(userId).select('+pushToken').exec();

    return user ? toNotificationProfile(user) : null;
  }

  async updateProfile(userId: string, patch: NotificationProfilePatch) {
    const set: Record<string, string> = {};
    const unset: Record<string, 1> = {};

    for (const [field, value] of Object.entries(patch) as [keyof NotificationProfile, string | null][]) {
      if (value === null) {
        unset[field] = 1;
      } else {
        set[field] = value;
      }
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        ...(Object.keys(set).length > 0 ? { $set: set } : {}),
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {})
      },
      { new: true }
    ).select('+pushToken').exec();

    return user ? toNotificationProfile(user) : null;
  }
}