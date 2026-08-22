import type { ApiErrorResponse } from '@safealert/contracts';

const fallbackApiUrl = 'http://localhost:4000/api/v1';

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? fallbackApiUrl;

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
};

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorResponse).error?.code === 'string'
  );
}

export async function apiRequest<TResponse>(path: string, options: ApiRequestOptions = {}) {
  const url = `${apiBaseUrl}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed.';
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      `Cannot reach SafeAlert API at ${apiBaseUrl}. ${message}`
    );
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = isApiErrorResponse(data) ? data.error : undefined;
    throw new ApiClientError(
      response.status,
      error?.code ?? 'API_ERROR',
      error?.message ?? 'Request failed.'
    );
  }

  return data as TResponse;
}
