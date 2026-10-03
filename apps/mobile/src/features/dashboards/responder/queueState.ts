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
    PENDING: getVisibleResponderRequests(queueState, 'PENDING').length,
    ASSIGNED: getVisibleResponderRequests(queueState, 'ASSIGNED').length
  };
}

export function getOwnedResponderAssignments(
  requests: readonly SafeResponseRequest[],
  responderId: string,
  completed = false
) {
  // This is a defensive UI filter. The API independently scopes both lists by assignment.
  return requests.filter((request) => request.assignedResponderId === responderId &&
    (completed ? request.status === 'COMPLETED' : isActiveAssignedResponseStatus(request.status)));
}

export function getVisibleResponderRequests(
  queueState: ResponderQueueState,
  activeTab: RequestTab
) {
  // Keep the two queues visually separate so responders can quickly
  // distinguish unassigned requests from work already assigned to them.
  if (activeTab === 'PENDING') {
    // Mirror the server's NEW-only queue defensively so terminal or unknown
    // statuses cannot become actionable rows or inflate the tab count.
    return queueState.pending.filter((request) => request.status === 'NEW');
  }

  return queueState.assigned.filter((request) => isActiveAssignedResponseStatus(request.status));
}
