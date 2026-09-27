import type { NotificationProfile } from '@safealert/contracts';

/** A null value clears the stored field; every other value is stored normalized. */
export type NotificationProfilePatch = Partial<Record<keyof NotificationProfile, string | null>>;

export interface NotificationProfileRepository {
  findProfile(userId: string): Promise<NotificationProfile | null>;
  updateProfile(userId: string, patch: NotificationProfilePatch): Promise<NotificationProfile | null>;
}