import {
  EMERGENCY_ASSISTANCE_TYPES,
  ROAD_ACCESSIBILITIES
} from '@safealert/contracts';
import { z } from 'zod';

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
