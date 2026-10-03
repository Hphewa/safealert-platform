import { z } from 'zod';
import {
  WARNING_ATTACHMENT_REFERENCE_PATTERN, WARNING_DISTRICTS, WARNING_FIELD_LIMITS,
  WARNING_MESSAGE_MIN_LENGTH, WARNING_REQUIRED_ACTION_MIN_LENGTH,
  WARNING_SAFE_ROUTES_MIN_LENGTH, WARNING_UNSAFE_ROADS_MIN_LENGTH
} from '@safealert/contracts';

// The server stays authoritative: required, trimmed, whitespace-only rejection,
// and the same minimum/maximum lengths the mobile form shows in its inline hints.
const requiredText = (label: string, min: number, max: number) => z.string().trim()
  .min(1, `${label} is required.`)
  .min(min, `${label} must be at least ${min} characters.`)
  .max(max, `${label} must be at most ${max} characters.`);
const optionalText = (label: string, min: number, max: number) => z.string().trim()
  .max(max, `${label} must be at most ${max} characters.`)
  .refine((value) => value.length === 0 || value.length >= min,
    `${label} must be at least ${min} characters when provided.`);
// Shared field rules so create and update (LDFEW-115) validate identically.
const affectedAreaField = requiredText('Affected Area', 1, WARNING_FIELD_LIMITS.affectedArea);
const requiredActionField = requiredText('Required Action', WARNING_REQUIRED_ACTION_MIN_LENGTH, WARNING_FIELD_LIMITS.requiredAction);
const unsafeRoadsField = requiredText('Unsafe Roads', WARNING_UNSAFE_ROADS_MIN_LENGTH, WARNING_FIELD_LIMITS.unsafeRoads);
const safeRoutesField = optionalText('Safe Routes', WARNING_SAFE_ROUTES_MIN_LENGTH, WARNING_FIELD_LIMITS.safeRoutes);
const messageField = requiredText('Reason / Message', WARNING_MESSAGE_MIN_LENGTH, WARNING_FIELD_LIMITS.message);
const attachmentsField = z.array(z.string().refine((value) => WARNING_ATTACHMENT_REFERENCE_PATTERN.test(value) || /^https?:\/\//i.test(value), 'Upload images before attaching them.'))
  .max(WARNING_FIELD_LIMITS.attachments)
  .refine((values) => new Set(values).size === values.length, 'Each image can only be attached once.');

export const createWarningSchema = z.object({
  assessmentId: z.string().regex(/^[a-f\d]{24}$/i, 'A valid assessment ID is required.'),
  affectedArea: affectedAreaField,
  requiredAction: requiredActionField,
  unsafeRoads: unsafeRoadsField,
  safeRoutes: safeRoutesField.optional(),
  message: messageField,
  attachments: attachmentsField.optional()
}).strict();

// LDFEW-115: update reuses the exact create field rules but only accepts the
// permitted content fields. The strict schema rejects forged status, risk level,
// relationship, and publication fields; assessmentId is accepted for request
// compatibility and is never applied by the service.
export const updateWarningSchema = z.object({
  assessmentId: z.string().regex(/^[a-f\d]{24}$/i, 'A valid assessment ID is required.').optional(),
  affectedArea: affectedAreaField.optional(),
  requiredAction: requiredActionField.optional(),
  unsafeRoads: unsafeRoadsField.optional(),
  safeRoutes: safeRoutesField.optional(),
  message: messageField.optional(),
  attachments: attachmentsField.optional()
}).strict();

const notificationTargetSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('AFFECTED_AREA') }).strict(),
  z.object({ scope: z.literal('DISTRICT'), district: z.enum(WARNING_DISTRICTS) }).strict(),
  z.object({ scope: z.literal('WHOLE_COUNTRY') }).strict()
]);

export const publishWarningSchema = z.object({
  notificationTarget: notificationTargetSchema
}).strict();
