import { z } from 'zod';

export const communityReportClusterObjectIdSchema = z.string()
  .regex(/^[a-f\d]{24}$/i, 'A valid community report cluster id is required.')
  .transform((id) => id.toLowerCase());

