import type { UserRole } from '@safealert/contracts';
import { matchesNotificationTarget } from '../notificationTargeting.js';
import type {
  NotificationRecipient,
  NotificationRecipientQuery,
  NotificationRecipientRepository
} from './notificationRecipient.repository.js';

type SeededUser = NotificationRecipient & {
  role: UserRole;
  isActive: boolean;
};

export type SeedResidentInput = {
  id: string;
  role?: UserRole;
  isActive?: boolean;
  area?: string | null;
  district?: string | null;
  country?: string | null;
  phoneNumber?: string | null;
  pushToken?: string | null;
};

export class InMemoryNotificationRecipientRepository implements NotificationRecipientRepository {
  private readonly users = new Map<string, SeededUser>();

  seedResident(input: SeedResidentInput) {
    this.users.set(input.id, {
      id: input.id,
      role: input.role ?? 'RESIDENT',
      isActive: input.isActive ?? true,
      area: input.area ?? null,
      district: input.district ?? null,
      country: input.country ?? null,
      phoneNumber: input.phoneNumber ?? null,
      pushToken: input.pushToken ?? null
    });
  }

  async findResidents(query: NotificationRecipientQuery) {
    return [...this.users.values()]
      // Targeting is always limited to active RESIDENT accounts.
      .filter((user) => user.role === 'RESIDENT' && user.isActive)
      .filter((user) => matchesNotificationTarget(user, query))
      .map((user) => structuredClone<NotificationRecipient>({
        id: user.id,
        area: user.area,
        district: user.district,
        country: user.country,
        phoneNumber: user.phoneNumber,
        pushToken: user.pushToken
      }));
  }

  async findResidentById(id: string) {
    const user = this.users.get(id);
    if (!user || user.role !== 'RESIDENT' || !user.isActive) return null;
    return structuredClone<NotificationRecipient>({ id: user.id, area: user.area, district: user.district, country: user.country, phoneNumber: user.phoneNumber, pushToken: user.pushToken });
  }
}
