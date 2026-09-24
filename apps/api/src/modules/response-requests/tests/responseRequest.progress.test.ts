import { describe, expect, it } from 'vitest';

import {
  getNextResponseProgressStatus,
  getResponseProgressAction,
  isValidResponseProgressTransition,
  type ResponseStatus
} from '@safealert/contracts';

describe('response request progress transition rules', () => {
  it.each([
    ['ASSIGNED', 'DISPATCHED'],
    ['DISPATCHED', 'ARRIVED'],
    ['ARRIVED', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'COMPLETED']
  ] as const)('allows the valid progression from %s to %s', (currentStatus, nextStatus) => {
    expect(isValidResponseProgressTransition(currentStatus, nextStatus)).toBe(true);
    expect(getNextResponseProgressStatus(currentStatus)).toBe(nextStatus);
    expect(getResponseProgressAction(currentStatus)).toEqual({
      nextStatus,
      label: expect.any(String)
    });
  });

  it.each([
    ['NEW', 'DISPATCHED'],
    ['ASSIGNED', 'ARRIVED'],
    ['ASSIGNED', 'COMPLETED'],
    ['ARRIVED', 'DISPATCHED'],
    ['COMPLETED', 'IN_PROGRESS']
  ] as const)('rejects invalid progression from %s to %s', (currentStatus, nextStatus) => {
    expect(isValidResponseProgressTransition(currentStatus, nextStatus)).toBe(false);
  });

  it('rejects same status and completed updates', () => {
    const statuses: ResponseStatus[] = ['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];

    for (const status of statuses) {
      expect(isValidResponseProgressTransition(status, status)).toBe(false);
    }

    expect(isValidResponseProgressTransition('COMPLETED', 'COMPLETED')).toBe(false);
    expect(getNextResponseProgressStatus('COMPLETED')).toBeNull();
    expect(getResponseProgressAction('COMPLETED')).toBeNull();
  });
});
