import {
  WARNING_ATTACHMENT_REFERENCE_PATTERN,
  WARNING_FIELD_LIMITS,
  WARNING_MESSAGE_MIN_LENGTH,
  WARNING_REQUIRED_ACTION_MIN_LENGTH,
  WARNING_SAFE_ROUTES_MIN_LENGTH,
  WARNING_UNSAFE_ROADS_MIN_LENGTH,
  type CreateWarningRequest,
  type RiskAssessmentResponse,
} from '@safealert/contracts';
import { formatIncidentLocation } from './incidentGrouping';

// Match the source report selected by WarningService.create, regardless of response order.
export function getWarningAffectedArea(context: RiskAssessmentResponse | null): string | null {
  const sourceId = context?.incident.reportIds[0];
  const sourceReport = context?.reports.find((report) => report.id === sourceId);
  if (!sourceReport) return null;
  const [longitude, latitude] = sourceReport.location.coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return formatIncidentLocation(sourceReport.location);
}

export const warningFields = [
  { key: 'affectedArea', label: 'Affected Area', required: true, min: 1, placeholder: 'e.g. Riverside village, lower valley' },
  { key: 'requiredAction', label: 'Required Action', required: true, min: WARNING_REQUIRED_ACTION_MIN_LENGTH, placeholder: 'Describe what people should do' },
  { key: 'unsafeRoads', label: 'Unsafe Roads', required: true, min: WARNING_UNSAFE_ROADS_MIN_LENGTH, placeholder: 'List unsafe roads, or enter None known' },
  { key: 'safeRoutes', label: 'Safe Routes', required: false, min: WARNING_SAFE_ROUTES_MIN_LENGTH, placeholder: 'Describe safe alternative routes, if known' },
  { key: 'message', label: 'Reason / Message', required: true, min: WARNING_MESSAGE_MIN_LENGTH, placeholder: 'Explain the warning and give clear safety instructions' }
] as const;
type WarningTextFieldKey = (typeof warningFields)[number]['key'];
export type WarningForm = Record<WarningTextFieldKey, string> & {
  attachments: string;
};
export type WarningFormErrors = Partial<Record<keyof WarningForm, string>>;
export const initialWarningForm: WarningForm = {
  affectedArea: '', requiredAction: '', unsafeRoads: '', safeRoutes: '', message: '', attachments: ''
};

// Mirrors the server-side createWarningSchema: required fields must contain more
// than whitespace, every value is measured after trimming, and optional values are
// only length-checked when provided. Entered values are never truncated.
export function validateWarningForm(form: WarningForm): WarningFormErrors {
  const errors: WarningFormErrors = {};
  for (const field of warningFields) {
    const value = form[field.key].trim();
    const max = WARNING_FIELD_LIMITS[field.key];
    if (!value) {
      if (field.required) errors[field.key] = `${field.label} is required.`;
    } else if (value.length < field.min) {
      errors[field.key] = `Enter at least ${field.min} characters for ${field.label}.`;
    } else if (value.length > max) {
      errors[field.key] = `Keep ${field.label} to ${max} characters or fewer.`;
    }
  }
  const attachments = parseAttachmentReferences(form.attachments);
  if (attachments.length > WARNING_FIELD_LIMITS.attachments) {
    errors.attachments = `Add at most ${WARNING_FIELD_LIMITS.attachments} attachments.`;
  } else if (attachments.some((reference) => reference.length > WARNING_FIELD_LIMITS.attachmentUrl)) {
    errors.attachments = `Each attachment reference must be at most ${WARNING_FIELD_LIMITS.attachmentUrl} characters.`;
  } else if (attachments.some((reference) => !WARNING_ATTACHMENT_REFERENCE_PATTERN.test(reference))) {
    errors.attachments = 'Upload images before attaching them.';
  }
  return errors;
}

export function parseWarningForm(assessmentId: string, form: WarningForm): CreateWarningRequest {
  const errors = validateWarningForm(form);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const attachments = parseAttachmentReferences(form.attachments);
  return {
    assessmentId, affectedArea: form.affectedArea.trim(), requiredAction: form.requiredAction.trim(),
    unsafeRoads: form.unsafeRoads.trim(), message: form.message.trim(),
    ...(form.safeRoutes.trim() ? { safeRoutes: form.safeRoutes.trim() } : {}),
    attachments
  };
}

function parseAttachmentReferences(value: string) {
  return value
    .split(/\r?\n/)
    .map((reference) => reference.trim())
    .filter(Boolean);
}
