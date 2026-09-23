import { describe, expect, it } from 'vitest';

import { displayValue, responderRequestDetailsHref } from './requestDetails';

describe('responder request details navigation', () => {
  it('builds a route from the real request ID', () => {
    expect(responderRequestDetailsHref('request/one')).toBe('/responder/requests/request%2Fone');
  });

  it('does not build a route for a missing request ID', () => {
    expect(responderRequestDetailsHref(undefined)).toBeNull();
    expect(responderRequestDetailsHref('')).toBeNull();
  });

  it('uses a safe fallback for missing display values', () => {
    expect(displayValue(undefined)).toBe('Not provided');
    expect(displayValue(null)).toBe('Not provided');
    expect(displayValue('')).toBe('Not provided');
  });
});