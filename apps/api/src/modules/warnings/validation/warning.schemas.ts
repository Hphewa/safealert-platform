import { z } from 'zod';
import { WARNING_ATTACHMENT_REFERENCE_PATTERN, WARNING_DISTRICTS, WARNING_FIELD_LIMITS } from '@safealert/contracts';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
export const createWarningSchema = z.object({
  assessmentId: z.string().regex(/^[a-f\d]{24}$/i, 'A valid assessment ID is required.'),
  affectedArea: requiredText(WARNING_FIELD_LIMITS.affectedArea),
  requiredAction: requiredText(WARNING_FIELD_LIMITS.requiredAction),
  unsafeRoads: requiredText(WARNING_FIELD_LIMITS.unsafeRoads),
  safeRoutes: z.string().trim().max(WARNING_FIELD_LIMITS.safeRoutes).optional(),
  message: requiredText(WARNING_FIELD_LIMITS.message),
  attachments: z.array(z.string().refine((value) => WARNING_ATTACHMENT_REFERENCE_PATTERN.test(value) || /^https?:\/\//i.test(value), 'Upload images before attaching them.'))
    .max(WARNING_FIELD_LIMITS.attachments)
    .refine((values) => new Set(values).size === values.length, 'Each image can only be attached once.').optional()
}).strict();

const notificationTargetSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('AFFECTED_AREA') }).strict(),
  z.object({ scope: z.literal('DISTRICT'), district: z.enum(WARNING_DISTRICTS) }).strict(),
  z.object({ scope: z.literal('WHOLE_COUNTRY') }).strict()
]);

export const publishWarningSchema = z.object({
  notificationTarget: notificationTargetSchema
}).strict();
