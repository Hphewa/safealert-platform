import type { SafeResponseRequest } from '@safealert/contracts';

export type RequestTab = 'PENDING' | 'ASSIGNED';

export type ResponderQueueState = {
  pending: SafeResponseRequest[];
  assigned: SafeResponseRequest[];
};

export function getResponderQueueCounts(queueState: ResponderQueueState) {
  return {
    PENDING: Math.max(0, queueState.pending.length),
    ASSIGNED: Math.max(0, queueState.assigned.length)
  };
}

export function getVisibleResponderRequests(
  queueState: ResponderQueueState,
  activeTab: RequestTab
) {
  // Keep the two queues visually separate so responders can quickly
  // distinguish unassigned requests from work already assigned to them.
  return activeTab === 'PENDING' ? queueState.pending : queueState.assigned;
}