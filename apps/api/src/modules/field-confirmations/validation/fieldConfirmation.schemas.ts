import { z } from 'zod';
import { FIELD_CONFIRMATION_REASON_MAX_LENGTH, UNABLE_TO_CONFIRM_REASONS } from '@safealert/contracts';

export const reportIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid report id.');
export const confirmSchema = z.object({}).strict();
export const unableToConfirmSchema = z.object({
  reason: z.enum(UNABLE_TO_CONFIRM_REASONS),
  reasonDetails: z.string().trim().min(1).max(FIELD_CONFIRMATION_REASON_MAX_LENGTH).optional()
}).strict().refine((input) => input.reason !== 'Other' || Boolean(input.reasonDetails), {
  message: 'Please describe why you are unable to confirm.', path: ['reasonDetails']
});
