import {
  getResponseProgressAction,
  RESPONSE_STATUSES,
  type SafeResponseRequest,
  type SafeUser
} from '@safealert/contracts';

import { ApiClientError } from '../../../services/api/client';
import { progressErrorMessage, type ResponderProgressStatus } from './api/responderProgressApi';

export function canManageResponderProgress(request: SafeResponseRequest | null, user: SafeUser | null) {
  return Boolean(
    request &&
    typeof request.id === 'string' &&
    /^[a-f\d]{24}$/i.test(request.id) &&
    RESPONSE_STATUSES.some((status) => status === request.status) &&
    request.status !== 'NEW' &&
    user?.role === 'EMERGENCY_RESPONDER' &&
    user.id === request.assignedResponderId
  );
}

export function getResponderProgressAction(
  request: SafeResponseRequest | null,
  user: SafeUser | null
): { nextStatus: ResponderProgressStatus; label: string } | null {
  if (!request || !canManageResponderProgress(request, user)) {
    return null;
  }

  const action = getResponseProgressAction(request.status);
  if (!action || action.nextStatus === 'NEW' || action.nextStatus === 'ASSIGNED') {
    return null;
  }

  return { nextStatus: action.nextStatus, label: action.label };
}

export function responderProgressFeedback(error: unknown) {
  return error instanceof ApiClientError
    ? progressErrorMessage(error)
    : 'Unable to confirm request progress. Please check your connection and try again.';
}

export function progressStatusLabel(status: SafeResponseRequest['status']) {
  const label = status.toLowerCase().replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}
