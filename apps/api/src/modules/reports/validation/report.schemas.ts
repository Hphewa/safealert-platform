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

export const communityReportQueryModes = ['incoming', 'nearby'] as const;

const latitudeQuerySchema = z.coerce
  .number()
  .min(-90, 'Latitude must be at least -90.')
  .max(90, 'Latitude must be at most 90.')
  .refine(Number.isFinite, 'Latitude must be a finite number.');

const longitudeQuerySchema = z.coerce
  .number()
  .min(-180, 'Longitude must be at least -180.')
  .max(180, 'Longitude must be at most 180.')
  .refine(Number.isFinite, 'Longitude must be a finite number.');

export const maxCommunityReportRadiusKm = 25;

const radiusQuerySchema = z.coerce
  .number()
  .positive('Radius must be greater than 0.')
  .max(maxCommunityReportRadiusKm, `Radius must be at most ${maxCommunityReportRadiusKm} km.`)
  .refine(Number.isFinite, 'Radius must be a finite number.');

export const communityReportQuerySchema = z
  .object({
    mode: z.enum(communityReportQueryModes).optional(),
    latitude: z.union([latitudeQuerySchema, z.undefined()]),
    longitude: z.union([longitudeQuerySchema, z.undefined()]),
    radiusKm: z.union([radiusQuerySchema, z.undefined()])
  })
  .superRefine((value, context) => {
    const resolvedMode = value.mode ?? (value.latitude !== undefined || value.longitude !== undefined ? 'nearby' : 'incoming');
    const hasAnyNearbyParam =
      value.latitude !== undefined || value.longitude !== undefined || value.radiusKm !== undefined;

    if (resolvedMode === 'nearby') {
      if (value.latitude === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Latitude is required for nearby mode.',
          path: ['latitude']
        });
      }

      if (value.longitude === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Longitude is required for nearby mode.',
          path: ['longitude']
        });
      }
    }

    if (resolvedMode === 'incoming' && hasAnyNearbyParam) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Latitude, longitude, and radiusKm are only allowed for nearby mode.',
        path: ['mode']
      });
    }
  });

export const reportReviewActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('VERIFY')
  }),
  z.object({
    action: z.literal('REJECT'),
    rejectionReason: z.string().trim().min(1, 'Rejection reason is required.')
  })
]);
