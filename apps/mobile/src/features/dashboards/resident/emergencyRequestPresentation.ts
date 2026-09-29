import { RESPONSE_ACTIVE_ASSIGNED_STATUSES, RESPONSE_EDITABLE_STATUS, RESPONSE_PROGRESS_SEQUENCE, type ResponseStatus, type SafeResponseRequest } from '@safealert/contracts';

import { accessConditionLabels, emergencyAssistanceTypeLabels } from './emergencyAssistanceDraft';
import { formatResidentReportDateTime } from './reports';

// Keep backend lifecycle values unchanged while presenting readable status labels to residents.
const residentRequestStatusLabels: Record<ResponseStatus, string> = {
  NEW: 'Submitted',
  ASSIGNED: 'Assigned',
  DISPATCHED: 'Dispatched',
  ARRIVED: 'Arrived',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

// Residents also see submission (NEW); subsequent stages reuse the responder's persisted lifecycle.
const residentProgressSequence: readonly ResponseStatus[] = ['NEW', ...RESPONSE_PROGRESS_SEQUENCE];

export function residentEmergencyRequestEditUnavailableMessage(status: unknown): string | null {
  if (status === RESPONSE_EDITABLE_STATUS) return null;
  if (RESPONSE_ACTIVE_ASSIGNED_STATUSES.some((activeStatus) => activeStatus === status)) {
    return 'This request can no longer be edited because an Emergency Responder has already accepted it.';
  }
  if (status === 'COMPLETED') return 'Completed requests cannot be edited.';
  if (status === 'CANCELLED') return 'Cancelled requests cannot be edited.';
  return 'Editing is unavailable. Refresh this request to check its latest status.';
}

export type ResidentEmergencyRequestProgressStage = {
  status: ResponseStatus;
  label: string;
  state: 'reached' | 'current' | 'future';
};

export function buildResidentEmergencyRequestProgress(status: unknown): ResidentEmergencyRequestProgressStage[] | null {
  const currentIndex = residentProgressSequence.findIndex((stage) => stage === status);
  // An unsupported status must not imply that any normal lifecycle stage has been reached.
  if (currentIndex < 0) return null;

  return residentProgressSequence.map((stage, index) => ({
    status: stage,
    label: residentRequestStatusLabels[stage],
    state: index < currentIndex ? 'reached' : index === currentIndex ? 'current' : 'future'
  }));
}

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

export function presentResidentEmergencyRequestDetails(request: SafeResponseRequest) {
  const summary = presentResidentEmergencyRequest(request);
  const coordinates = request.location?.type === 'Point' && Array.isArray(request.location.coordinates)
    && request.location.coordinates.length === 2 ? request.location.coordinates : [];

  return {
    status: summary.status,
    sections: [
      { title: 'Request Information', fields: [
        { label: 'Request ID', value: detailText(request.id) },
        { label: 'Assistance', value: summary.assistanceType },
        { label: 'Submitted', value: summary.submittedAt }
      ] },
      // LDFEW-266 / LDFEW-357: Present response outcome and completion details to the resident.
      // Internal responder remarks and operational field notes are strictly excluded.
      ...(request.status === 'COMPLETED'
        ? [
            {
              title: 'Completion Details',
              fields: [
                { label: 'Completed date / time', value: formatResidentReportDateTime(request.completedAt) },
                { label: 'Assistance provided', value: detailText(request.assistanceProvided) },
                { label: 'Completion summary', value: detailText(request.completionSummary) }
              ]
            }
          ]
        : []),
      { title: 'People Needing Help', fields: [
        { label: 'People needing assistance', value: detailCount(request.affectedPeople) },
        { label: 'Injured people', value: detailCount(request.injuredPeople) }
      ] },
      { title: 'Vulnerable People', fields: [
        { label: 'Children', value: detailCount(request.vulnerablePeople?.children) },
        { label: 'Elderly people', value: detailCount(request.vulnerablePeople?.elderlyPeople) },
        { label: 'Persons with disabilities', value: detailCount(request.vulnerablePeople?.personsWithDisabilities) },
        { label: 'Pregnant persons', value: detailCount(request.vulnerablePeople?.pregnantPersons) }
      ] },
      { title: 'Medical Information', fields: [
        { label: 'Medical assistance', value: request.medicalNeeds === true ? 'Required'
          : request.medicalNeeds === false ? 'Not required' : 'Not provided' }
      ] },
      { title: 'Road Accessibility', fields: [
        { label: 'Road access', value: friendlyLabel(accessConditionLabels, request.roadAccessibility, 'Not provided') }
      ] },
      { title: 'Emergency Details', fields: [
        { label: 'Description', value: detailText(request.description) },
        { label: 'Special requirements', value: detailText(request.specialRequirements) }
      ] },
      { title: 'Location', fields: [
        { label: 'Latitude', value: detailCoordinate(coordinates[1], 90) },
        { label: 'Longitude', value: detailCoordinate(coordinates[0], 180) }
      ] },
      { title: 'Contact Information', fields: [
        { label: 'Name', value: detailText(request.contact?.name) },
        { label: 'Phone', value: detailText(request.contact?.phoneNumber) },
        { label: 'Email', value: detailText(request.contact?.email) }
      ] }
    ]
  };
}

function detailText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Not provided';
}

function detailCount(value: unknown): string {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? String(value) : 'Not provided';
}

function detailCoordinate(value: unknown, limit: number): string {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
    ? value.toFixed(6) : 'Not provided';
}
