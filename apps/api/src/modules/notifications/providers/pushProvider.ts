import type { NotificationProviderClient } from './notificationProvider.js';

export type PushDeliveryRequest = {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

export type PushProvider = NotificationProviderClient<PushDeliveryRequest>;