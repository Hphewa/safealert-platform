import { ApiClientError } from '../../../services/api/client';

export function getCancellationErrorFeedback(error: unknown): { message: string; refreshStatus: boolean } {
  const fallback = {
    message: 'Unable to confirm cancellation. Please refresh the request before trying again.',
    refreshStatus: false
  };
  // Interpret known codes, never error.message: transport and server exceptions
  // can contain internal details that must not reach the Resident.
  if (!(error instanceof ApiClientError)) return fallback;
  if (['INVALID_CANCELLATION_STATUS', 'REQUEST_CANCELLATION_CONFLICT'].includes(error.code) || error.status === 409) {
    return {
      message: 'This request can no longer be cancelled because its response status has changed.',
      refreshStatus: true
    };
  }
  if (error.code === 'UNAUTHORIZED' || error.status === 401) {
    return { message: 'Your session is no longer valid. Please sign in again.', refreshStatus: false };
  }
  if (['FORBIDDEN', 'REQUEST_NOT_OWNED'].includes(error.code) || error.status === 403) {
    return { message: 'You are not allowed to cancel this emergency request.', refreshStatus: false };
  }
  if (['REQUEST_NOT_FOUND', 'NOT_FOUND'].includes(error.code) || error.status === 404) {
    return { message: 'This emergency request could not be found. Please refresh your requests.', refreshStatus: false };
  }
  if (error.code === 'INVALID_REQUEST_ID') {
    return { message: 'This emergency request is unavailable. Please refresh your requests.', refreshStatus: false };
  }
  if (error.code === 'INVALID_RESPONSE') return fallback;
  if (error.code === 'NETWORK_ERROR' || error.status === 0) {
    return {
      message: 'Unable to connect right now. Please check your connection, then refresh the request before trying again.',
      refreshStatus: false
    };
  }
  if (error.status >= 500) {
    return { message: 'Unable to cancel this request right now. Please refresh and try again.', refreshStatus: false };
  }
  return fallback;
}
