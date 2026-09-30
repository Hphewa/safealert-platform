import { describe, expect, it } from 'vitest';

import { displayValue, parseResponderRequestTab, responderRequestDetailsHref, responderRequestReturnTab } from './requestDetails';

describe('responder request details navigation', () => {
  it('builds a route from the real request ID', () => {
    expect(responderRequestDetailsHref('request/one')).toBe('/responder/requests/request%2Fone');
  });

  it('does not build a route for a missing request ID', () => {
    expect(responderRequestDetailsHref(undefined)).toBeNull();
    expect(responderRequestDetailsHref('')).toBeNull();
  });

  it.each(['PENDING', 'ASSIGNED'] as const)('passes the %s source tab when opening details', (sourceTab) => {
    expect(responderRequestDetailsHref('request/one', sourceTab))
      .toBe(`/responder/requests/request%2Fone?sourceTab=${sourceTab}`);
    expect(parseResponderRequestTab(sourceTab)).toBe(sourceTab);
  });

  it.each(['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] as const)(
    'returns a directly opened %s request to Assigned without source state', (status) => {
      expect(responderRequestReturnTab(undefined, status)).toBe('ASSIGNED');
      expect(responderRequestReturnTab('invalid', status)).toBe('ASSIGNED');
    }
  );

  it('preserves the source after completion or when request data is unavailable', () => {
    expect(responderRequestReturnTab('ASSIGNED', 'COMPLETED')).toBe('ASSIGNED');
    expect(responderRequestReturnTab('ASSIGNED', undefined)).toBe('ASSIGNED');
    expect(responderRequestReturnTab('PENDING', 'NEW')).toBe('PENDING');
  });

  it.each([undefined, '', 'invalid', ['ASSIGNED', 'PENDING']])(
    'safely defaults to Pending with invalid navigation state %j and no active request', (sourceTab) => {
      expect(parseResponderRequestTab(sourceTab)).toBeUndefined();
      expect(responderRequestReturnTab(sourceTab, undefined)).toBe('PENDING');
      expect(responderRequestReturnTab(sourceTab, 'NEW')).toBe('PENDING');
    }
  );

  it('uses a safe fallback for missing display values', () => {
    expect(displayValue(undefined)).toBe('Not provided');
    expect(displayValue(null)).toBe('Not provided');
    expect(displayValue('')).toBe('Not provided');
    expect(displayValue('   ')).toBe('Not provided');
    expect(displayValue(Number.NaN)).toBe('Not provided');
    expect(displayValue('undefined')).toBe('Not provided');
    expect(displayValue('null')).toBe('Not provided');
    expect(displayValue('NaN')).toBe('Not provided');
  });
});
