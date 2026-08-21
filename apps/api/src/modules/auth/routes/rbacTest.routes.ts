import { Router } from 'express';

import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';

export function createRbacTestRouter(config: ApiConfig) {
  const router = Router();

  router.get('/resident-area', authenticate(config), authorizeRoles('RESIDENT'), (_request, response) => {
    response.json({ status: 'resident-allowed' });
  });

  router.get(
    '/officer-area',
    authenticate(config),
    authorizeRoles('DISASTER_OFFICER'),
    (_request, response) => {
      response.json({ status: 'officer-allowed' });
    }
  );

  return router;
}
