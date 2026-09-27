import { Router } from 'express';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createNotificationController } from '../controllers/notification.controller.js';
import type { NotificationProfileService } from '../services/notificationProfile.service.js';

/**
 * Authenticated notification profile endpoints. The mobile app registers or refreshes its
 * Firebase Cloud Messaging device token through `PUT /profile`; recipients are always
 * resolved by the backend from the database, never supplied by the client.
 */
export function createNotificationRouter(service: NotificationProfileService, config: ApiConfig) {
  const router = Router();
  router.use(authenticate(config), authorizeRoles('RESIDENT'));
  const controller = createNotificationController(service);
  router.get('/profile', controller.getProfile);
  router.put('/profile', controller.updateProfile);
  return router;
}
