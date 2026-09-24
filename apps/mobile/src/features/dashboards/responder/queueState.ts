import {
  RESPONSE_ACTIVE_ASSIGNED_STATUSES,
  type SafeResponseRequest
} from '@safealert/contracts';

export type RequestTab = 'PENDING' | 'ASSIGNED';

export type ResponderQueueState = {
  pending: SafeResponseRequest[];
  assigned: SafeResponseRequest[];
};

export function isActiveAssignedResponseStatus(
  status: SafeResponseRequest['status']
): boolean {
  return RESPONSE_ACTIVE_ASSIGNED_STATUSES.includes(status as (typeof RESPONSE_ACTIVE_ASSIGNED_STATUSES)[number]);
}

export function getResponderQueueCounts(queueState: ResponderQueueState) {
  return {
    PENDING: Math.max(0, queueState.pending.length),
    ASSIGNED: Math.max(0, queueState.assigned.filter((request) => isActiveAssignedResponseStatus(request.status)).length)
  };
}

export function getVisibleResponderRequests(
  queueState: ResponderQueueState,
  activeTab: RequestTab
) {
  // Keep the two queues visually separate so responders can quickly
  // distinguish unassigned requests from work already assigned to them.
  if (activeTab === 'PENDING') {
    return queueState.pending;
  }

  return queueState.assigned.filter((request) => isActiveAssignedResponseStatus(request.status));
}