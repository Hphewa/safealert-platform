import { randomUUID } from 'node:crypto';
import type { ProviderSendResult } from './notificationProvider.js';
import type { PushDeliveryRequest, PushProvider } from './pushProvider.js';

/**
 * Development/test push provider. Push mocking is not exposed through environment variables
 * in LDFEW-127; it exists so automated tests never need real Firebase credentials.
 */
export class MockPushProvider implements PushProvider {
  readonly name = 'MOCK' as const;
  readonly sentMessages: PushDeliveryRequest[] = [];

  isConfigured() {
    return true;
  }

  async send(request: PushDeliveryRequest): Promise<ProviderSendResult> {
    this.sentMessages.push(request);

    return {
      status: 'SENT',
      provider: this.name,
      providerStatus: 'OK',
      providerMessageId: `mock-push-${randomUUID()}`
    };
  }
}