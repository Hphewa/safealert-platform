import { describe, expect, it } from 'vitest';

import {
  emptyQueueDescription,
  emptyQueueTitle,
  responderQueueErrorMessage
} from './requestFlowState';

describe('responder request flow states', () => {
  it('provides distinct empty states for each queue', () => {
    expect(emptyQueueTitle('PENDING')).toBe('No pending requests');
    expect(emptyQueueDescription('PENDING')).toBe(
      'There are currently no emergency requests waiting for response.'
    );
    expect(emptyQueueTitle('ASSIGNED')).toBe('No assigned requests');
    expect(emptyQueueDescription('ASSIGNED')).toBe(
      'There are currently no emergency requests assigned to you.'
    );
  });

  it('keeps technical details out of user-facing error messages', () => {
    expect(responderQueueErrorMessage(true)).toBe('Check your connection and try again.');
    expect(responderQueueErrorMessage(false)).toBe(
      'The responder request queues could not be loaded. Please try again.'
    );
  });
});