import { WARNING_FIELD_LIMITS, type CreateWarningRequest } from '@safealert/contracts';

export const warningFields = [
  { key: 'affectedArea', label: 'Affected Area', required: true, placeholder: 'e.g. Riverside village, lower valley' },
  { key: 'requiredAction', label: 'Required Action', required: true, placeholder: 'Describe what people should do' },
  { key: 'unsafeRoads', label: 'Unsafe Roads', required: true, placeholder: 'List unsafe roads, or enter None known' },
  { key: 'safeRoutes', label: 'Safe Routes', required: false, placeholder: 'Describe safe alternative routes, if known' },
  { key: 'message', label: 'Reason / Message', required: true, placeholder: 'Explain the warning and give clear safety instructions' }
] as const;
export type WarningForm = Record<(typeof warningFields)[number]['key'], string>;
export type WarningFormErrors = Partial<Record<keyof WarningForm, string>>;
export const initialWarningForm: WarningForm = {
  affectedArea: '', requiredAction: '', unsafeRoads: '', safeRoutes: '', message: ''
};

export function validateWarningForm(form: WarningForm): WarningFormErrors {
  const errors: WarningFormErrors = {};
  for (const field of warningFields) {
    const value = form[field.key].trim();
    if (field.required && !value) errors[field.key] = `${field.label} is required.`;
    else if (value.length > WARNING_FIELD_LIMITS[field.key]) {
      errors[field.key] = `${field.label} must be at most ${WARNING_FIELD_LIMITS[field.key]} characters.`;
    }
  }
  return errors;
}

export function parseWarningForm(assessmentId: string, form: WarningForm): CreateWarningRequest {
  const errors = validateWarningForm(form);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    assessmentId, affectedArea: form.affectedArea.trim(), requiredAction: form.requiredAction.trim(),
    unsafeRoads: form.unsafeRoads.trim(), message: form.message.trim(),
    ...(form.safeRoutes.trim() ? { safeRoutes: form.safeRoutes.trim() } : {}),
    attachments: []
  };
}
