import type { SafeResponseRequest } from '@safealert/contracts';

const responseRequestCache = new Map<string, SafeResponseRequest>();

export function replaceResponderRequestCache(responseRequests: SafeResponseRequest[]) {
  responseRequestCache.clear();

  for (const responseRequest of responseRequests) {
    responseRequestCache.set(responseRequest.id, responseRequest);
  }
}

export function clearResponderRequestCache() {
  responseRequestCache.clear();
}

export function updateCachedResponderRequest(responseRequest: SafeResponseRequest) {
  responseRequestCache.set(responseRequest.id, responseRequest);
}

export function getCachedResponderRequest(requestId: string) {
  return responseRequestCache.get(requestId) ?? null;
}

export function getCachedAssignedResponderRequests(responderId: string) {
  // Offline navigation may reuse only this responder's previously loaded assignments.
  return [...responseRequestCache.values()].filter((request) => request.assignedResponderId === responderId);
}
