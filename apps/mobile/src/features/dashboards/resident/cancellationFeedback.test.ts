import { describe, expect, it } from 'vitest';

import { ApiClientError } from '../../../services/api/client';
import { getCancellationErrorFeedback } from './cancellationFeedback';

describe('Resident cancellation error feedback', () => {
  it.each([
    ['INVALID_CANCELLATION_STATUS', 409, 'response status has changed', true],
    ['REQUEST_CANCELLATION_CONFLICT', 409, 'response status has changed', true],
    ['UNAUTHORIZED', 401, 'Please sign in again.', false],
    ['REQUEST_NOT_OWNED', 403, 'not allowed to cancel', false],
    ['FORBIDDEN', 403, 'not allowed to cancel', false],
    ['REQUEST_NOT_FOUND', 404, 'could not be found', false],
    ['NOT_FOUND', 404, 'could not be found', false],
    ['INVALID_REQUEST_ID', 400, 'Please refresh your requests.', false],
    ['INVALID_RESPONSE', 502, 'Unable to confirm cancellation.', false],
    ['NETWORK_ERROR', 0, 'check your connection', false],
    ['INTERNAL_SERVER_ERROR', 500, 'Please refresh and try again.', false],
    ['UNRECOGNIZED', 400, 'Unable to confirm cancellation.', false]
  ] as const)('maps %s without exposing server details', (code, status, message, refreshStatus) => {
    const feedback = getCancellationErrorFeedback(new ApiClientError(status, code, 'MongoDB stack trace private-owner-id'));
    expect(feedback.message).toContain(message);
    expect(feedback.message).not.toMatch(/MongoDB|stack|private-owner-id/);
    expect(feedback.refreshStatus).toBe(refreshStatus);
  });

  it.each([new Error('Private transport failure'), null, undefined, 'Mongoose internal error', { message: 'Raw API data' }])(
    'uses a safe fallback for an unexpected failure: %j', (error) => {
      expect(getCancellationErrorFeedback(error)).toEqual({
        message: 'Unable to confirm cancellation. Please refresh the request before trying again.',
        refreshStatus: false
      });
    }
  );
});
