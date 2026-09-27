import type { Href } from 'expo-router';

export function parseResidentEmergencyRequestId(value: unknown): string | null {
  // Match the single-request API's ObjectId format; arrays are ambiguous route parameters.
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

export function residentEmergencyRequestDetailsHref(value: unknown) {
  const requestId = parseResidentEmergencyRequestId(value);
  return requestId ? {
    pathname: '/resident/emergency-request/[requestId]',
    params: { requestId }
  } as const satisfies Href : null;
}
