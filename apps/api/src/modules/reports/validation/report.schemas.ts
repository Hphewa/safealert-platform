import { HAZARD_TYPES, REPORT_SEVERITIES } from '@safealert/contracts';
import { z } from 'zod';

export const geoJsonPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z
    .tuple([
      z.number().min(-180, 'Longitude must be at least -180.').max(180, 'Longitude must be at most 180.'),
      z.number().min(-90, 'Latitude must be at least -90.').max(90, 'Latitude must be at most 90.')
    ])
    .refine(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude), {
      message: 'Location coordinates must be finite numbers.'
    })
});

export const createReportSchema = z.object({
  hazardType: z.enum(HAZARD_TYPES),
  description: z
    .string()
    .trim()
    .min(3, 'Description must be at least 3 characters.')
    .max(1000, 'Description must be at most 1000 characters.'),
  severity: z.enum(REPORT_SEVERITIES),
  location: geoJsonPointSchema,
  mediaReference: z.string().trim().min(1).max(500).optional()
});
