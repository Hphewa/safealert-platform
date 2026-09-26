import type { SafeResponseRequest } from '@safealert/contracts';

export type ResponderDecisionAction = 'idle' | 'accepting' | 'declining';

export function canShowResponderDecisionActions(responseRequest: SafeResponseRequest | null) {
  return responseRequest?.status === 'NEW' && Boolean(responseRequest.id.trim());
}

export function isResponderDecisionBusy(action: ResponderDecisionAction) {
  return action !== 'idle';
}

export function decisionButtonLabel(
  action: ResponderDecisionAction,
  decision: 'accept' | 'decline'
) {
  if ((decision === 'accept' && action === 'accepting') || (decision === 'decline' && action === 'declining')) {
    return decision === 'accept' ? 'Accepting...' : 'Declining...';
  }

  return decision === 'accept' ? 'Accept Request' : 'Decline Request';
}