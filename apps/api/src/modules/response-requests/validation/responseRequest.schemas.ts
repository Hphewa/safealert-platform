import {
  EMERGENCY_ASSISTANCE_TYPES,
  RESPONSE_STATUSES,
  ROAD_ACCESSIBILITIES
} from '@safealert/contracts';
import { z } from 'zod';

export const cancelResponseRequestSchema = z.object({
  params: z.object({
    // Reject malformed IDs before Mongoose can attempt to cast them.
    requestId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'A valid response request id is required.')
  }).strict(),
  // Cancellation takes its identity from authentication and its target from the URL.
  // Do not accept client-selected owners, statuses, or other mutation fields.
  body: z.object({}).strict().optional(),
  query: z.object({}).strict()
});

// LDFEW-266 / LDFEW-354: Validation for saving responder operational field notes.
// Strict body validation ensures only fieldNotes is accepted; client-supplied timestamps (e.g. fieldUpdatedAt,
// createdAt, updatedAt) are strictly rejected so that the authoritative timestamp is always generated on the server.
export const recordFieldUpdateSchema = z.object({
  params: z.object({
    // Reject malformed IDs before Mongoose can attempt to cast them
    requestId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'A valid response request id is required.')
  }).strict(),
  body: z.object({
    fieldNotes: z
      .string({ required_error: 'Field update notes are required.' })
      .trim()
      .min(3, 'Field update notes must be at least 3 characters.')
      .max(2000, 'Field update notes must be at most 2000 characters.')
  }).strict(),
  query: z.object({}).strict()
});

// LDFEW-121 & LDFEW-266 / LDFEW-354: Strict progress transitions, accepting completion details on final completion.
// Strict body validation rejects client-supplied timestamps (such as completedAt, createdAt, updatedAt) so that
// lifecycle timestamps can only be created by the server during valid state transitions.
export const responseRequestProgressSchema = z
  .object({
    status: z.enum(RESPONSE_STATUSES).exclude(['NEW', 'CANCELLED']),
    assistanceProvided: z
      .string()
      .trim()
      .min(3, 'Assistance provided must be at least 3 characters.')
      .max(1000, 'Assistance provided must be at most 1000 characters.')
      .optional(),
    completionSummary: z
      .string()
      .trim()
      .min(3, 'Completion summary must be at least 3 characters.')
      .max(1000, 'Completion summary must be at most 1000 characters.')
      .optional(),
    responderRemarks: z
      .string()
      .trim()
      .max(1000, 'Responder remarks must be at most 1000 characters.')
      .optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status !== 'COMPLETED') {
      if (data.assistanceProvided !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Assistance provided is only allowed when status is COMPLETED.',
          path: ['assistanceProvided']
        });
      }
      if (data.completionSummary !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Completion summary is only allowed when status is COMPLETED.',
          path: ['completionSummary']
        });
      }
      if (data.responderRemarks !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Responder remarks are only allowed when status is COMPLETED.',
          path: ['responderRemarks']
        });
      }
    }
  });

const geoJsonPointSchema = z
  .object({
    type: z.literal('Point'),
    coordinates: z
      .tuple([
        z
          .number()
          .min(-180, 'Longitude must be at least -180.')
          .max(180, 'Longitude must be at most 180.'),
        z.number().min(-90, 'Latitude must be at least -90.').max(90, 'Latitude must be at most 90.')
      ])
      .refine(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude), {
        message: 'Location coordinates must be finite numbers.'
      })
  })
  .strict();

const nonNegativeCountSchema = z
  .number()
  .int('Counts must be whole numbers.')
  .min(0, 'Counts cannot be negative.');

export const createResponseRequestSchema = z
  .object({
    assistanceType: z.enum(EMERGENCY_ASSISTANCE_TYPES),
    location: geoJsonPointSchema,
    affectedPeople: z
      .number()
      .int('Affected people must be a whole number.')
      .min(1, 'Affected people must be at least 1.'),
    medicalNeeds: z.boolean(),
    injuredPeople: z
      .number()
      .int('Injured people must be a whole number.')
      .min(0, 'Injured people cannot be negative.'),
    vulnerablePeople: z
      .object({
        children: nonNegativeCountSchema,
        elderlyPeople: nonNegativeCountSchema,
        personsWithDisabilities: nonNegativeCountSchema,
        pregnantPersons: nonNegativeCountSchema
      })
      .strict(),
    roadAccessibility: z.enum(ROAD_ACCESSIBILITIES),
    contact: z
      .object({
        name: z
          .string()
          .trim()
          .min(2, 'Contact name must be at least 2 characters.')
          .max(120, 'Contact name must be at most 120 characters.'),
        phoneNumber: z
          .string()
          .trim()
          .min(7, 'Contact phone number must be at least 7 characters.')
          .max(32, 'Contact phone number must be at most 32 characters.'),
        email: z.string().trim().email('Contact email must be valid.').max(320).optional()
      })
      .strict(),
    description: z
      .string()
      .trim()
      .min(3, 'Description must be at least 3 characters.')
      .max(1000, 'Description must be at most 1000 characters.'),
    specialRequirements: z
      .string()
      .trim()
      .max(500, 'Special requirements must be at most 500 characters.')
      .optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.injuredPeople > value.affectedPeople) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Injured people cannot exceed affected people.',
        path: ['injuredPeople']
      });
    }

    if (!value.medicalNeeds && value.injuredPeople !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Injured people must be 0 when medical needs are false.',
        path: ['injuredPeople']
      });
    }
  });

// A complete editable snapshot keeps the existing cross-field medical rules
// consistent with creation. Strict objects reject ownership and lifecycle fields.
export const updateResponseRequestSchema = z.object({
  params: z.object({
    requestId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'A valid response request id is required.')
  }).strict(),
  body: createResponseRequestSchema,
  query: z.object({}).strict()
});
