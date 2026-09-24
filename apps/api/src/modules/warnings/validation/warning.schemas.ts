import { z } from 'zod';
import { WARNING_ATTACHMENT_REFERENCE_PATTERN, WARNING_FIELD_LIMITS } from '@safealert/contracts';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
export const createWarningSchema = z.object({
  assessmentId: z.string().regex(/^[a-f\d]{24}$/i, 'A valid assessment ID is required.'),
  affectedArea: requiredText(WARNING_FIELD_LIMITS.affectedArea),
  requiredAction: requiredText(WARNING_FIELD_LIMITS.requiredAction),
  unsafeRoads: requiredText(WARNING_FIELD_LIMITS.unsafeRoads),
  safeRoutes: z.string().trim().max(WARNING_FIELD_LIMITS.safeRoutes).optional(),
  message: requiredText(WARNING_FIELD_LIMITS.message),
  attachments: z.array(z.string().regex(WARNING_ATTACHMENT_REFERENCE_PATTERN, 'Upload images before attaching them.'))
    .max(WARNING_FIELD_LIMITS.attachments)
    .refine((values) => new Set(values).size === values.length, 'Each image can only be attached once.').optional()
}).strict();
