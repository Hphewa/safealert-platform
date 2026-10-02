import type { Href } from 'expo-router';
import type { ResponseStatus } from '@safealert/contracts';

import { isActiveAssignedResponseStatus, type RequestTab } from './queueState';

export type ResponderAssignmentView = 'active' | 'map' | 'history';

export function parseResponderAssignmentView(value: unknown): ResponderAssignmentView | undefined {
  return value === 'active' || value === 'map' || value === 'history' ? value : undefined;
}

export function parseResponderRequestTab(value: string | string[] | undefined): RequestTab | undefined {
  return value === 'ASSIGNED' || value === 'PENDING' ? value : undefined;
}

export function responderRequestReturnTab(
  sourceTab: string | string[] | undefined,
  status: ResponseStatus | undefined
): RequestTab {
  // Preserve the source even after completion; direct links can infer an active assignment.
  return parseResponderRequestTab(sourceTab) ??
    (status && isActiveAssignedResponseStatus(status) ? 'ASSIGNED' : 'PENDING');
}

export function responderRequestDetailsHref(requestId: string | undefined, sourceTab?: RequestTab, sourceScreen?: ResponderAssignmentView): Href | null {
  if (!requestId?.trim()) {
    return null;
  }

  // Use the request's real backend ID so the details screen opens the correct request.
  const query = [sourceTab ? `sourceTab=${sourceTab}` : '', sourceScreen ? `sourceScreen=${sourceScreen}` : ''].filter(Boolean).join('&');
  return `/responder/requests/${encodeURIComponent(requestId)}${query ? `?${query}` : ''}`;
}

// Defensive value formatter for request detail rows: ensures missing, empty,
// or placeholder strings ('undefined', 'null', 'NaN') never leak into user-facing text.
export function displayValue(value: string | number | null | undefined) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'number' && Number.isNaN(value)) ||
    (typeof value === 'string' && (value.trim() === '' || value === 'undefined' || value === 'null' || value === 'NaN'))
  ) {
    return 'Not provided';
  }

  return String(value);
}
