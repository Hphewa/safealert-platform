import type { Href } from 'expo-router';
import type { ResponseStatus } from '@safealert/contracts';

import { isActiveAssignedResponseStatus, type RequestTab } from './queueState';

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

export function responderRequestDetailsHref(requestId: string | undefined, sourceTab?: RequestTab): Href | null {
  if (!requestId?.trim()) {
    return null;
  }

  // Use the request's real backend ID so the details screen opens the correct request.
  return `/responder/requests/${encodeURIComponent(requestId)}${sourceTab ? `?sourceTab=${sourceTab}` : ''}`;
}

export function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 'Not provided';
  }

  return String(value);
}
