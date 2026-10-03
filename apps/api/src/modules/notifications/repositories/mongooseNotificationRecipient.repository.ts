import { UserModel } from '../../users/models/user.model.js';
import type {
  NotificationRecipient,
  NotificationRecipientQuery,
  NotificationRecipientRepository
} from './notificationRecipient.repository.js';

// A target that normalized to nothing can never match a stored resident.
const unmatchedResidentFilter = { role: 'RESIDENT', isActive: true, _id: { $exists: false } };

// Keep this small query shape local. Importing Mongoose's internal FilterQuery type here
// makes the API source fail when it is included by the Expo/mobile TypeScript project.
type ResidentFilter = {
  role: string;
  isActive: boolean;
  area?: string | null;
  district?: string | null;
  country?: string | null;
  $or?: Array<{ country: string | null }>;
  _id?: { $exists: boolean };
};

/**
 * Database form of the targeting rule. Only active RESIDENT accounts are ever returned.
 * Recipients are resolved from persisted user records, never from client input.
 */
export function buildResidentFilter(query: NotificationRecipientQuery): ResidentFilter {
  if (query.scope === 'AFFECTED_AREA') {
    return query.area === null ? unmatchedResidentFilter : { role: 'RESIDENT', isActive: true, area: query.area };
  }

  if (query.scope === 'DISTRICT') {
    return query.district === null ? unmatchedResidentFilter : { role: 'RESIDENT', isActive: true, district: query.district };
  }

  return {
    role: 'RESIDENT',
    isActive: true,
    // Country must match; do not include residents with no saved country.
    country: query.country
  };
}

export class MongooseNotificationRecipientRepository implements NotificationRecipientRepository {
  async findResidentById(id: string): Promise<NotificationRecipient | null> {
    const user = await UserModel.findOne({ _id: id, role: 'RESIDENT', isActive: true }).select('+pushToken').exec();
    return user ? { id: user._id.toString(), area: user.area ?? null, district: user.district ?? null, country: user.country ?? null, phoneNumber: user.phoneNumber ?? null, pushToken: user.pushToken ?? null } : null;
  }

  async findResidents(query: NotificationRecipientQuery): Promise<NotificationRecipient[]> {
    const users = await UserModel.find(buildResidentFilter(query) as unknown as Parameters<typeof UserModel.find>[0])
      .select('+pushToken').exec();

    return users.map((user) => ({
      id: user._id.toString(),
      area: user.area ?? null,
      district: user.district ?? null,
      country: user.country ?? null,
      phoneNumber: user.phoneNumber ?? null,
      pushToken: user.pushToken ?? null
    }));
  }
}
