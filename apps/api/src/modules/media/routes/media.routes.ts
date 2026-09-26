import express, { Router } from 'express';

import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import type { LocalMediaStorage } from '../services/localMediaStorage.js';
import { createMediaController } from '../controllers/media.controller.js';

export function createMediaRouter(storage: LocalMediaStorage, config: ApiConfig) {
  const router = Router();
  const controller = createMediaController(storage, config);

  router.use('/report-evidence', express.static(`${config.mediaUploadDir}/report-evidence`));
  router.post(
    '/report-evidence',
    authenticate(config),
    authorizeRoles('RESIDENT', 'COMMUNITY_VOLUNTEER'),
    controller.uploadReportEvidence
  );

  return router;
}
