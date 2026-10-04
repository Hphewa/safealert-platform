import {
  RESPONSE_ACTIVE_ASSIGNED_STATUSES,
  type SafeResponseRequest,
  type SafeUser
} from '@safealert/contracts';

// LDFEW-266 / LDFEW-358: Check if logged-in responder can record field updates
export function canRecordFieldUpdate(
  request: SafeResponseRequest | null,
  user: SafeUser | null
): boolean {
  return Boolean(
    request &&
    typeof request.id === 'string' &&
    /^[a-f\d]{24}$/i.test(request.id) &&
    RESPONSE_ACTIVE_ASSIGNED_STATUSES.some((status) => status === request.status) &&
    user?.role === 'EMERGENCY_RESPONDER' &&
    user.id === request.assignedResponderId
  );
}

// LDFEW-266 / LDFEW-353: Validate field update notes
export function validateFieldNotes(notes: string): string | null {
  const trimmed = typeof notes === 'string' ? notes.trim() : '';

  if (!trimmed) {
    return 'Field update notes cannot be empty.';
  }

  if (trimmed.length < 3) {
    return 'Field update notes must be at least 3 characters.';
  }

  if (trimmed.length > 2000) {
    return 'Field update notes must be at most 2000 characters.';
  }

  return null;
}

// LDFEW-266 / LDFEW-352: Detailed field-level validation errors
export type CompletionFieldErrors = {
  assistanceProvided?: string;
  completionSummary?: string;
  responderRemarks?: string;
};

// LDFEW-266 / LDFEW-352: Detailed field-level validation for completion details form
export function validateCompletionFormFields(details: {
  assistanceProvided?: string;
  completionSummary?: string;
  responderRemarks?: string;
}): CompletionFieldErrors {
  const errors: CompletionFieldErrors = {};
  const assistance = typeof details.assistanceProvided === 'string' ? details.assistanceProvided.trim() : '';
  const summary = typeof details.completionSummary === 'string' ? details.completionSummary.trim() : '';
  const remarks = typeof details.responderRemarks === 'string' ? details.responderRemarks.trim() : '';

  if (!assistance) {
    errors.assistanceProvided = 'Assistance provided is required.';
  } else if (assistance.length < 3) {
    errors.assistanceProvided = 'Assistance provided must be at least 3 characters.';
  } else if (assistance.length > 1000) {
    errors.assistanceProvided = 'Assistance provided must be at most 1000 characters.';
  }

  if (!summary) {
    errors.completionSummary = 'Completion summary is required.';
  } else if (summary.length < 3) {
    errors.completionSummary = 'Completion summary must be at least 3 characters.';
  } else if (summary.length > 1000) {
    errors.completionSummary = 'Completion summary must be at most 1000 characters.';
  }

  if (remarks.length > 1000) {
    errors.responderRemarks = 'Responder remarks must be at most 1000 characters.';
  }

  return errors;
}

// LDFEW-266 / LDFEW-353: Validate completion details
export function validateCompletionDetails(details: {
  assistanceProvided?: string;
  completionSummary?: string;
  responderRemarks?: string;
}): string | null {
  const assistance = typeof details.assistanceProvided === 'string' ? details.assistanceProvided.trim() : '';
  const summary = typeof details.completionSummary === 'string' ? details.completionSummary.trim() : '';
  const remarks = typeof details.responderRemarks === 'string' ? details.responderRemarks.trim() : '';

  if (!assistance) {
    return 'Please describe the assistance provided to the resident.';
  }

  if (assistance.length < 3) {
    return 'Assistance provided must be at least 3 characters.';
  }

  if (assistance.length > 1000) {
    return 'Assistance provided must be at most 1000 characters.';
  }

  if (!summary) {
    return 'Please provide a completion summary or outcome.';
  }

  if (summary.length < 3) {
    return 'Completion summary must be at least 3 characters.';
  }

  if (summary.length > 1000) {
    return 'Completion summary must be at most 1000 characters.';
  }

  if (remarks.length > 1000) {
    return 'Responder remarks must be at most 1000 characters.';
  }

  return null;
}

// LDFEW-266 / LDFEW-354: Readable timestamp formatting for UI
export function formatUpdateTimestamp(timestamp?: string): string {
  if (!timestamp) return 'Not available';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}
