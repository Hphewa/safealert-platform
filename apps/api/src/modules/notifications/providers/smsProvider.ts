import type { NotificationProviderClient } from './notificationProvider.js';

export type SmsDeliveryRequest = {
  to: string;
  message: string;
};

export type SmsProvider = NotificationProviderClient<SmsDeliveryRequest>;