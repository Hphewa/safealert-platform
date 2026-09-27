import type { NotificationProfile } from '@safealert/contracts';
import type { NotificationProfilePatch, NotificationProfileRepository } from './notificationProfile.repository.js';

export class InMemoryNotificationProfileRepository implements NotificationProfileRepository {
  readonly profiles = new Map<string, NotificationProfile>();

  seedProfile(userId: string, profile: NotificationProfile = {}) {
    this.profiles.set(userId, { ...profile });
  }

  async findProfile(userId: string) {
    const profile = this.profiles.get(userId);

    return profile ? structuredClone(profile) : null;
  }

  async updateProfile(userId: string, patch: NotificationProfilePatch) {
    const current = this.profiles.get(userId);

    if (!current) return null;

    const next: NotificationProfile = { ...current };

    for (const [field, value] of Object.entries(patch) as [keyof NotificationProfile, string | null][]) {
      if (value === null) {
        delete next[field];
      } else {
        next[field] = value;
      }
    }

    this.profiles.set(userId, next);

    return structuredClone(next);
  }
}