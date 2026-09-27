import type { NotifyLkConfig } from '../../../config/env.js';
import { isRecord, parseJsonSafely, sanitizeProviderText } from '../utils/redactSecrets.js';
import { providerFailure, type ProviderSendResult } from './notificationProvider.js';
import type { SmsDeliveryRequest, SmsProvider } from './smsProvider.js';

export const NOTIFY_LK_SEND_ENDPOINT = 'https://app.notify.lk/api/v1/send';

/**
 * Notify.lk SMS provider.
 *
 * Official endpoint: POST https://app.notify.lk/api/v1/send (GET is also supported; POST is
 * used so the API key never appears in a URL). Required parameters: user_id, api_key,
 * sender_id, to, message. The `to` value must already be normalized to 9471XXXXXXX.
 *
 * The documented success response is {"status":"success","data":"Sent"}. An HTTP 200 alone
 * is never treated as a successful send.
 */
export class NotifyLkSmsProvider implements SmsProvider {
  readonly name = 'NOTIFY_LK' as const;

  constructor(
    private readonly config: NotifyLkConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoint: string = NOTIFY_LK_SEND_ENDPOINT
  ) {}

  isConfigured() {
    return Boolean(this.config.userId && this.config.apiKey);
  }

  private secrets() {
    return [this.config.apiKey, this.config.userId];
  }

  async send({ to, message }: SmsDeliveryRequest): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      return providerFailure(
        this.name,
        'PROVIDER_NOT_CONFIGURED',
        'Notify.lk credentials are not configured on the server.'
      );
    }

    const body = new URLSearchParams({
      user_id: this.config.userId ?? '',
      api_key: this.config.apiKey ?? '',
      sender_id: this.config.senderId,
      to,
      message
    });

    let response: Response;

    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
    } catch (error) {
      return providerFailure(
        this.name,
        'PROVIDER_REQUEST_FAILED',
        sanitizeProviderText(error instanceof Error ? error.message : 'Notify.lk request failed.', this.secrets())
      );
    }

    const rawBody = await response.text().catch(() => '');
    const payload = parseJsonSafely(rawBody);

    if (response.ok && isRecord(payload) && payload.status === 'success') {
      const data = payload.data;
      const providerStatus = typeof data === 'string'
        ? data
        : isRecord(data) && typeof data.status === 'string'
          ? data.status
          : 'success';
      const providerMessageId = isRecord(data) && (typeof data.uid === 'string' || typeof data.uid === 'number')
        ? String(data.uid)
        : undefined;

      return {
        status: 'SENT',
        provider: this.name,
        providerStatus,
        ...(providerMessageId ? { providerMessageId } : {})
      };
    }

    if (!isRecord(payload)) {
      return providerFailure(
        this.name,
        `HTTP_${response.status}`,
        'Notify.lk returned an unexpected response.'
      );
    }

    const errorCode = typeof payload.code === 'string' || typeof payload.code === 'number'
      ? String(payload.code)
      : typeof payload.status === 'string'
        ? payload.status
        : `HTTP_${response.status}`;
    const errorMessage = typeof payload.message === 'string'
      ? payload.message
      : typeof payload.error === 'string'
        ? payload.error
        : 'Notify.lk rejected the message.';

    return providerFailure(
      this.name,
      sanitizeProviderText(errorCode, this.secrets(), 128),
      sanitizeProviderText(errorMessage, this.secrets())
    );
  }
}