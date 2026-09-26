import { z } from 'zod';
import {
  FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH,
  FIELD_CONFIRMATION_REASON_MAX_LENGTH,
  UNABLE_TO_CONFIRM_REASONS
} from '@safealert/contracts';

export const reportIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid report id.');
const uploadedMediaReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/^file:\/\//i.test(value), {
    message: 'Media reference must point to uploaded evidence.'
  });

export const confirmSchema = z.object({
  verificationChecklist: z.object({
    locationMatches: z.boolean({ required_error: 'Location match must be checked.' }),
    photoMatches: z.boolean({ required_error: 'Photo match must be checked.' }),
    situationStillExists: z.boolean({ required_error: 'Current situation must be checked.' }),
    severityAppearsCorrect: z.boolean({ required_error: 'Severity check must be supplied.' })
  }).strict(),
  observation: z.string().trim().max(FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH).optional(),
  mediaReference: uploadedMediaReferenceSchema.optional()
}).strict();
export const unableToConfirmSchema = z.object({
  reason: z.enum(UNABLE_TO_CONFIRM_REASONS),
  reasonDetails: z.string().trim().min(1).max(FIELD_CONFIRMATION_REASON_MAX_LENGTH).optional()
}).strict().refine((input) => input.reason !== 'Other' || Boolean(input.reasonDetails), {
  message: 'Please describe why you are unable to confirm.', path: ['reasonDetails']
});
