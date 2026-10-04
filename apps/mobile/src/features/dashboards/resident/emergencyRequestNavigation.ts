import type { Href } from 'expo-router';

export function parseResidentEmergencyRequestId(value: unknown): string | null {
  // Match the single-request API's ObjectId format; arrays are ambiguous route parameters.
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

export function residentEmergencyRequestDetailsHref(
  value: unknown,
  options?: { refreshed?: boolean | string; updated?: boolean | string }
) {
  const requestId = parseResidentEmergencyRequestId(value);
  if (!requestId) return null;
  const params: Record<string, string> = { requestId };
  if (options?.refreshed) {
    params.refreshed = String(options.refreshed);
  }
  if (options?.updated) {
    params.updated = String(options.updated);
  }
  return {
    pathname: '/resident/emergency-request/[requestId]',
    params
  } as const satisfies Href;
}

export function residentEmergencyRequestEditHref(value: unknown) {
  const requestId = parseResidentEmergencyRequestId(value);
  // Carry only identity; the edit flow must read current owner-scoped server data.
  return requestId ? {
    pathname: '/resident/emergency-request/[requestId]/edit',
    params: { requestId }
  } as const satisfies Href : null;
}

export function residentEmergencyRequestReviewHref(value: unknown) {
  const requestId = parseResidentEmergencyRequestId(value);
  // Carry identity and target review step for deep linking and testing.
  return requestId ? {
    pathname: '/resident/emergency-request/[requestId]/edit',
    params: { requestId, step: 'review' }
  } as const satisfies Href : null;
}

