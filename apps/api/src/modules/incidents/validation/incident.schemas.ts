import { INCIDENT_MAX_REPORTS } from '@safealert/contracts';
import { z } from 'zod';

// Canonical IDs keep duplicate detection and the in-memory adapter consistent with MongoDB.
export const incidentObjectIdSchema = z.string()
  .regex(/^[a-f\d]{24}$/i, 'A valid ObjectId is required.')
  .transform((id) => id.toLowerCase());

export const createIncidentSchema = z.object({
  reportIds: z.array(incidentObjectIdSchema)
    .min(1, 'An incident must contain at least one report.')
    .max(INCIDENT_MAX_REPORTS, `An incident may contain at most ${INCIDENT_MAX_REPORTS} reports.`)
    .refine((ids) => new Set(ids).size === ids.length, 'Report references must be unique.')
}).strict();

export const incidentCandidateQuerySchema = z.object({ reportId: incidentObjectIdSchema }).strict();
