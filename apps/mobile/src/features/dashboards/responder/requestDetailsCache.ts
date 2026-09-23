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

export function getCachedResponderRequest(requestId: string) {
  return responseRequestCache.get(requestId) ?? null;
}