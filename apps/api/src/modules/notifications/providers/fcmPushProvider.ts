import { createSign } from 'node:crypto';
import type { FirebaseConfig } from '../../../config/env.js';
import { isRecord, parseJsonSafely, sanitizeProviderText } from '../utils/redactSecrets.js';
import { providerFailure, type ProviderSendResult } from './notificationProvider.js';
import type { PushDeliveryRequest, PushProvider } from './pushProvider.js';

const firebaseMessagingScope = 'https://www.googleapis.com/auth/firebase.messaging';
const defaultApiBaseUrl = 'https://fcm.googleapis.com';
const defaultTokenUrl = 'https://oauth2.googleapis.com/token';
const assertionLifetimeSeconds = 3600;
const accessTokenSafetyWindowSeconds = 60;

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}

/**
 * Firebase Cloud Messaging provider using the FCM HTTP v1 API.
 *
 * The backend authenticates with a Firebase service account (project ID, client email and
 * private key) that only exists in the backend environment. The service account private key
 * and the minted OAuth access token are never logged, stored, or returned to clients.
 *
 * No Firebase Admin SDK dependency is added in LDFEW-127 so the notification module stays
 * dependency-free; the wire protocol is identical to `getMessaging().send()`.
 */
export class FcmPushProvider implements PushProvider {
  readonly name = 'FCM' as const;
  private cachedAccessToken: { value: string; expiresAtSeconds: number } | null = null;

  constructor(
    private readonly config: FirebaseConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly apiBaseUrl: string = defaultApiBaseUrl,
    private readonly tokenUrl: string = defaultTokenUrl
  ) {}

  isConfigured() {
    return Boolean(this.config.projectId && this.config.clientEmail && this.config.privateKey);
  }

  private secrets() {
    return [this.config.privateKey, this.cachedAccessToken?.value];
  }

  async send({ token, title, body, data }: PushDeliveryRequest): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      return providerFailure(
        this.name,
        'PROVIDER_NOT_CONFIGURED',
        'Firebase Cloud Messaging credentials are not configured on the server.'
      );
    }

    let accessToken: string;

    try {
      accessToken = await this.getAccessToken();
    } catch (error) {
      return providerFailure(
        this.name,
        'PROVIDER_AUTH_FAILED',
        sanitizeProviderText(error instanceof Error ? error.message : 'Firebase authentication failed.', this.secrets())
      );
    }

    let response: Response;

    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}/v1/projects/${this.config.projectId}/messages:send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ message: { token, notification: { title, body }, data } })
      });
    } catch (error) {
      return providerFailure(
        this.name,
        'PROVIDER_REQUEST_FAILED',
        sanitizeProviderText(error instanceof Error ? error.message : 'Firebase request failed.', this.secrets())
      );
    }

    const rawBody = await response.text().catch(() => '');
    const payload = parseJsonSafely(rawBody);

    if (response.ok && isRecord(payload) && typeof payload.name === 'string') {
      return {
        status: 'SENT',
        provider: this.name,
        providerMessageId: payload.name,
        providerStatus: 'OK'
      };
    }

    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    // FCM v1 returns the canonical error status (for example UNREGISTERED or INVALID_ARGUMENT).
    const errorCode = error && typeof error.status === 'string' ? error.status : `HTTP_${response.status}`;
    const errorMessage = error && typeof error.message === 'string'
      ? error.message
      : 'Firebase Cloud Messaging rejected the message.';

    return providerFailure(
      this.name,
      sanitizeProviderText(errorCode, this.secrets(), 128),
      sanitizeProviderText(errorMessage, this.secrets())
    );
  }

  private async getAccessToken() {
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (this.cachedAccessToken && this.cachedAccessToken.expiresAtSeconds > nowSeconds + accessTokenSafetyWindowSeconds) {
      return this.cachedAccessToken.value;
    }

    const response = await this.fetchImpl(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: this.createAssertion(nowSeconds)
      }).toString()
    });

    const payload = parseJsonSafely(await response.text().catch(() => ''));
    const accessToken = isRecord(payload) && typeof payload.access_token === 'string' ? payload.access_token : null;
    const expiresIn = isRecord(payload) && typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : assertionLifetimeSeconds;

    if (!response.ok || !accessToken) {
      throw new Error(`Firebase authentication failed with status ${response.status}.`);
    }

    this.cachedAccessToken = { value: accessToken, expiresAtSeconds: nowSeconds + expiresIn };

    return accessToken;
  }

  private createAssertion(nowSeconds: number) {
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(JSON.stringify({
      iss: this.config.clientEmail,
      scope: firebaseMessagingScope,
      aud: this.tokenUrl,
      iat: nowSeconds,
      exp: nowSeconds + assertionLifetimeSeconds
    }));
    const signer = createSign('RSA-SHA256');

    signer.update(`${header}.${claims}`);

    // Dotenv values often escape newlines as literal \n sequences.
    const privateKey = (this.config.privateKey ?? '').replace(/\\n/g, '\n');

    return `${header}.${claims}.${signer.sign(privateKey, 'base64url')}`;
  }
}