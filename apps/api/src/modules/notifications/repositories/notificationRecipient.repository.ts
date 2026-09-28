export type NotificationRecipientQuery =
  | { scope: 'AFFECTED_AREA'; area: string | null }
  | { scope: 'DISTRICT'; district: string | null }
  | { scope: 'WHOLE_COUNTRY'; country: string };

/**
 * Only the contact fields needed for delivery are exposed. Location values are stored
 * normalized, so they can be compared directly with a normalized target.
 */
export type NotificationRecipient = {
  id: string;
  area: string | null;
  district: string | null;
  country: string | null;
  phoneNumber: string | null;
  pushToken: string | null;
};

export interface NotificationRecipientRepository {
  /** Resolves active RESIDENT users matching the warning notification scope. */
  findResidents(query: NotificationRecipientQuery): Promise<NotificationRecipient[]>;
}