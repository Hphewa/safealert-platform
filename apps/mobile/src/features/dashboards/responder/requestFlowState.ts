import type { RequestTab } from './queueState';

export function emptyQueueTitle(activeTab: RequestTab) {
  return activeTab === 'PENDING' ? 'No pending requests' : 'No assigned requests';
}

export function emptyQueueDescription(activeTab: RequestTab) {
  return activeTab === 'PENDING'
    ? 'There are currently no emergency requests waiting for response.'
    : 'There are currently no emergency requests assigned to you.';
}

export function responderQueueErrorMessage(hasNetworkError: boolean) {
  return hasNetworkError
    ? 'Check your connection and try again.'
    : 'The responder request queues could not be loaded. Please try again.';
}