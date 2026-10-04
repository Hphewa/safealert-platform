import type { NotificationProvider } from '@safealert/contracts';

export type ProviderSendSuccess = {
  status: 'SENT';
  provider: NotificationProvider;
  providerMessageId?: string;
  providerStatus?: string;
};

export type ProviderSendFailure = {
  status: 'FAILED';
  provider: NotificationProvider;
  errorCode: string;
  errorMessage: string;
};

export type ProviderSendResult = ProviderSendSuccess | ProviderSendFailure;

/**
 * Backend-only provider boundary. Providers are only ever constructed on the API server;
 * credentials never reach the mobile app and are never returned in API responses.
 */
export interface NotificationProviderClient<TRequest> {
  readonly name: NotificationProvider;
  isConfigured(): boolean;
  send(request: TRequest): Promise<ProviderSendResult>;
}

export function providerFailure(
  provider: NotificationProvider,
  errorCode: string,
  errorMessage: string
): ProviderSendFailure {
  return { status: 'FAILED', provider, errorCode, errorMessage };
}