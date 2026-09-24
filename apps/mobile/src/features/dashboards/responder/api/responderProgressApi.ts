import {
  EMERGENCY_ASSISTANCE_TYPES,
  RESPONSE_PROGRESS_SEQUENCE,
  ROAD_ACCESSIBILITIES,
  type ResponseStatus,
  type SafeResponseRequest
} from '@safealert/contracts';

import { ApiClientError, apiRequest } from '../../../../services/api/client';

export type ResponderProgressStatus = Exclude<ResponseStatus, 'NEW' | 'ASSIGNED'>;

const progressTimestampFields = {
  DISPATCHED: 'dispatchedAt',
  ARRIVED: 'arrivedAt',
  IN_PROGRESS: 'inProgressAt',
  COMPLETED: 'completedAt'
} as const satisfies Record<ResponderProgressStatus, keyof SafeResponseRequest>;

// LDFEW-121 progresses requests after ASSIGNED. Acceptance remains in LDFEW-130.
export async function updateResponderRequestProgress(
  requestId: string,
  status: ResponderProgressStatus,
  accessToken: string
): Promise<SafeResponseRequest> {
  if (!isNonEmptyString(requestId)) {
    throw new ApiClientError(400, 'INVALID_REQUEST_ID', 'Select an emergency request to update.');
  }

  if (!RESPONSE_PROGRESS_SEQUENCE.some((candidate) => candidate !== 'ASSIGNED' && candidate === status)) {
    throw new ApiClientError(400, 'INVALID_STATUS', 'Select a supported progress status.');
  }

  if (!isNonEmptyString(accessToken)) {
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Please log in again to update this request.');
  }

  const normalizedId = requestId.trim();

  try {
    const response = await apiRequest<unknown>(
      `/response-requests/${encodeURIComponent(normalizedId)}/progress`,
      { method: 'PATCH', accessToken, body: { status } }
    );

    if (
      !isProgressResponse(response, status) ||
      response.id.toLowerCase() !== normalizedId.toLowerCase()
    ) {
      throw new ApiClientError(0, 'INVALID_API_RESPONSE', 'Unable to confirm the updated request. Refresh it before trying again.');
    }

    return response;
  } catch (error) {
    // A failed response can follow a successful server write; do not automatically retry mutations.
    if (error instanceof ApiClientError) {
      throw new ApiClientError(error.status, error.code, progressErrorMessage(error));
    }

    throw new ApiClientError(0, 'API_ERROR', 'Unable to confirm request progress. Refresh the request before trying again.');
  }
}

function progressErrorMessage(error: ApiClientError): string {
  if (error.code === 'INVALID_API_RESPONSE') {
    return 'Unable to confirm the updated request. Refresh it before trying again.';
  }

  switch (error.status) {
    case 401:
      return 'Please log in again to update this request.';
    case 403:
      return error.code === 'REQUEST_NOT_ASSIGNED'
        ? 'Only the responder assigned to this request can update its progress.'
        : 'You do not have permission to update this request.';
    case 404:
      return 'This emergency request could not be found. Refresh your requests.';
    case 409:
      return error.code === 'INVALID_PROGRESS_TRANSITION'
        ? 'This progress change is not allowed. Refresh the request to see its current status.'
        : 'This request has changed. Refresh it before updating its progress.';
    case 400:
      return error.code === 'INVALID_REQUEST_ID'
        ? 'The emergency request ID is invalid. Refresh your requests.'
        : 'The progress update is invalid. Check the request and selected status.';
    case 0:
      return 'Unable to confirm progress. Check your connection and refresh the request before trying again.';
    default:
      return 'Unable to confirm request progress right now. Refresh the request before trying again.';
  }
}

function isProgressResponse(value: unknown, status: ResponderProgressStatus): value is SafeResponseRequest {
  if (!isRecord(value)) {
    return false;
  }

  const { location, contact, vulnerablePeople } = value;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.residentId) &&
    isNonEmptyString(value.assignedResponderId) &&
    value.status === status &&
    EMERGENCY_ASSISTANCE_TYPES.some((type) => type === value.assistanceType) &&
    ROAD_ACCESSIBILITIES.some((access) => access === value.roadAccessibility) &&
    isRecord(location) &&
    location.type === 'Point' &&
    Array.isArray(location.coordinates) &&
    location.coordinates.length === 2 &&
    location.coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) &&
    isCount(value.affectedPeople) && value.affectedPeople > 0 &&
    isCount(value.injuredPeople) &&
    typeof value.medicalNeeds === 'boolean' &&
    isRecord(vulnerablePeople) &&
    ['children', 'elderlyPeople', 'personsWithDisabilities', 'pregnantPersons'].every(
      (field) => isCount(vulnerablePeople[field])
    ) &&
    isRecord(contact) &&
    isNonEmptyString(contact.name) &&
    isNonEmptyString(contact.phoneNumber) &&
    (contact.email === undefined || typeof contact.email === 'string') &&
    typeof value.description === 'string' &&
    (value.specialRequirements === undefined || typeof value.specialRequirements === 'string') &&
    (value.declinedByResponderIds === undefined || (
      Array.isArray(value.declinedByResponderIds) && value.declinedByResponderIds.every(isNonEmptyString)
    )) &&
    isDateString(value.createdAt) &&
    isDateString(value.updatedAt) &&
    isDateString(value[progressTimestampFields[status]]) &&
    ['acceptedAt', ...Object.values(progressTimestampFields)].every(
      (field) => value[field] === undefined || isDateString(value[field])
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
