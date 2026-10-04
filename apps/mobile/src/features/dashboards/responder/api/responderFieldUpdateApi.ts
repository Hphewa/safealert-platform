import {
  EMERGENCY_ASSISTANCE_TYPES,
  RESPONSE_STATUSES,
  ROAD_ACCESSIBILITIES,
  type SafeResponseRequest
} from '@safealert/contracts';

import { ApiClientError, apiRequest } from '../../../../services/api/client';

// LDFEW-266 / LDFEW-350: API client for saving responder operational field updates
export async function saveResponderFieldUpdate(
  requestId: string,
  fieldNotes: string,
  accessToken: string
): Promise<SafeResponseRequest> {
  if (!isNonEmptyString(requestId)) {
    throw new ApiClientError(400, 'INVALID_REQUEST_ID', 'Select an emergency request to update.');
  }

  const trimmedNotes = typeof fieldNotes === 'string' ? fieldNotes.trim() : '';
  if (!trimmedNotes || trimmedNotes.length < 3) {
    throw new ApiClientError(
      400,
      'INVALID_FIELD_UPDATE',
      'Field update notes must be at least 3 characters.'
    );
  }

  if (trimmedNotes.length > 2000) {
    throw new ApiClientError(
      400,
      'INVALID_FIELD_UPDATE',
      'Field update notes must be at most 2000 characters.'
    );
  }

  if (!isNonEmptyString(accessToken)) {
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Please log in again to update this request.');
  }

  const normalizedId = requestId.trim();

  try {
    const response = await apiRequest<unknown>(
      `/response-requests/${encodeURIComponent(normalizedId)}/field-update`,
      {
        method: 'PATCH',
        accessToken,
        body: { fieldNotes: trimmedNotes }
      }
    );

    if (
      !isFieldUpdateResponse(response) ||
      response.id.toLowerCase() !== normalizedId.toLowerCase()
    ) {
      throw new ApiClientError(
        0,
        'INVALID_API_RESPONSE',
        'Unable to confirm the saved field update. Refresh the request before trying again.'
      );
    }

    return response;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw new ApiClientError(error.status, error.code, fieldUpdateErrorMessage(error));
    }

    throw new ApiClientError(
      0,
      'API_ERROR',
      'Unable to save field update. Refresh the request before trying again.'
    );
  }
}

export function fieldUpdateErrorMessage(error: ApiClientError): string {
  if (error.code === 'INVALID_API_RESPONSE') {
    return 'Unable to confirm the saved field update. Refresh the request before trying again.';
  }

  switch (error.status) {
    case 401:
      return 'Please log in again to update this request.';
    case 403:
      return error.code === 'REQUEST_NOT_ASSIGNED'
        ? 'Only the responder assigned to this request can record field updates.'
        : 'You do not have permission to update this request.';
    case 404:
      return 'This emergency request could not be found. Refresh your requests.';
    case 409:
      return error.code === 'INVALID_REQUEST_STATUS'
        ? 'Field updates cannot be recorded on this request in its current status.'
        : 'This request has changed. Refresh it before saving field updates.';
    case 400:
      return error.code === 'INVALID_REQUEST_ID'
        ? 'The emergency request ID is invalid. Refresh your requests.'
        : 'Field update notes must be between 3 and 2000 characters.';
    case 0:
      return 'Unable to save field update. Check your connection and try again.';
    default:
      return 'Unable to save field update right now. Refresh the request before trying again.';
  }
}

function isFieldUpdateResponse(value: unknown): value is SafeResponseRequest {
  if (!isRecord(value)) {
    return false;
  }

  const { location, contact, vulnerablePeople } = value;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.residentId) &&
    isNonEmptyString(value.assignedResponderId) &&
    RESPONSE_STATUSES.some((status) => status === value.status) &&
    EMERGENCY_ASSISTANCE_TYPES.some((type) => type === value.assistanceType) &&
    ROAD_ACCESSIBILITIES.some((access) => access === value.roadAccessibility) &&
    isRecord(location) &&
    location.type === 'Point' &&
    Array.isArray(location.coordinates) &&
    location.coordinates.length === 2 &&
    location.coordinates.every((coord) => typeof coord === 'number' && Number.isFinite(coord)) &&
    isCount(value.affectedPeople) && value.affectedPeople > 0 &&
    isCount(value.injuredPeople) &&
    typeof value.medicalNeeds === 'boolean' &&
    isRecord(vulnerablePeople) &&
    isRecord(contact) &&
    isNonEmptyString(contact.name) &&
    isNonEmptyString(contact.phoneNumber) &&
    typeof value.description === 'string' &&
    isDateString(value.createdAt) &&
    isDateString(value.updatedAt) &&
    // Field update validation
    isNonEmptyString(value.fieldNotes) &&
    isDateString(value.fieldUpdatedAt)
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
