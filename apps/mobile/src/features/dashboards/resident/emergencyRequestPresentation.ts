import type { ResponseStatus, SafeResponseRequest } from '@safealert/contracts';

import { emergencyAssistanceTypeLabels } from './emergencyAssistanceDraft';
import { formatResidentReportDateTime } from './reports';

// Keep backend lifecycle values unchanged while presenting readable status labels to residents.
const residentRequestStatusLabels: Record<ResponseStatus, string> = {
  NEW: 'Submitted',
  ASSIGNED: 'Assigned',
  DISPATCHED: 'Dispatched',
  ARRIVED: 'Arrived',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed'
};

type EmergencyRequestSummary = Pick<SafeResponseRequest, 'assistanceType' | 'createdAt' | 'status'>;

export function presentResidentEmergencyRequest(request: EmergencyRequestSummary) {
  return {
    assistanceType: friendlyLabel(emergencyAssistanceTypeLabels, request.assistanceType, 'Emergency Assistance'),
    submittedAt: formatResidentReportDateTime(typeof request.createdAt === 'string' ? request.createdAt : undefined),
    status: friendlyLabel(residentRequestStatusLabels, request.status, 'Status unavailable')
  };
}

function friendlyLabel<T extends string>(labels: Record<T, string>, value: unknown, fallback: string) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(labels, value)
    ? labels[value as T]
    : fallback;
}
