import type { Href } from 'expo-router';

export function responderRequestDetailsHref(requestId: string | undefined): Href | null {
  if (!requestId?.trim()) {
    return null;
  }

  // Use the request's real backend ID so the details screen opens the correct request.
  return `/responder/requests/${encodeURIComponent(requestId)}`;
}

export function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 'Not provided';
  }

  return String(value);
}