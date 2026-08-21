import { Router } from 'express';

import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import type { AuthService } from '../services/auth.service.js';
import { createAuthController } from '../controllers/auth.controller.js';

export function createAuthRouter(authService: AuthService, config: ApiConfig) {
  const router = Router();
  const controller = createAuthController(authService);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', authenticate(config), controller.me);

  return router;
}
