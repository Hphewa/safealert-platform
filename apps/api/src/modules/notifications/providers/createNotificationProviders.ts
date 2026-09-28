import type { ApiConfig } from '../../../config/env.js';
import { FcmPushProvider } from './fcmPushProvider.js';
import { MockSmsProvider } from './mockSmsProvider.js';
import { NotifyLkSmsProvider } from './notifyLkSmsProvider.js';
import type { PushProvider } from './pushProvider.js';
import type { SmsProvider } from './smsProvider.js';

/**
 * Provider selection. Notify.lk is the only supported SMS provider; Twilio is deliberately
 * not implemented. Mock providers need an explicit opt-in and are never selected in
 * production because the flag must be set to "true" in the server environment.
 */
export function createSmsProvider(config: ApiConfig): SmsProvider {
  if (config.notificationSmsMockEnabled || config.smsProvider === 'mock') {
    return new MockSmsProvider();
  }

  if (config.smsProvider !== 'notifylk') {
    // Unknown provider names (for example "twilio") resolve to an unconfigured provider so
    // deliveries are recorded as SKIPPED instead of silently using the wrong integration.
    return new NotifyLkSmsProvider({
      userId: undefined,
      apiKey: undefined,
      senderId: config.notifyLk.senderId
    });
  }

  return new NotifyLkSmsProvider(config.notifyLk);
}

export function createPushProvider(config: ApiConfig): PushProvider {
  return new FcmPushProvider(config.firebase);
}
