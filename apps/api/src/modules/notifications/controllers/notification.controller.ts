import type { RequestHandler } from 'express';
import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { NotificationProfileService } from '../services/notificationProfile.service.js';
import { updateNotificationProfileSchema } from '../validation/notification.schemas.js';
import type { WarningNotificationService } from '../services/warningNotification.service.js';

export function createNotificationController(service: NotificationProfileService) {
  const getProfile: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    response.json(await service.get(request.auth.id));
  });
  const updateProfile: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    response.json(await service.update(request.auth.id, updateNotificationProfileSchema.parse(request.body)));
  });

  return { getProfile, updateProfile };
}

export function createNotificationRetryController(service: WarningNotificationService): RequestHandler {
  return asyncHandler(async (request, response) => {
    try {
      const notificationId = request.params.notificationId;
      if (!notificationId) throw new ApiError(400, 'INVALID_NOTIFICATION_ID', 'Notification id is required.');
      response.json({ delivery: await service.retryFailedDelivery(notificationId) });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'RETRY_FAILED';
      const status = code === 'NOTIFICATION_NOT_FOUND' || code === 'RECIPIENT_NOT_FOUND' ? 404 : code === 'NOTIFICATION_NOT_RETRYABLE' ? 409 : code === 'WARNING_NOT_PUBLISHED' ? 409 : 400;
      throw new ApiError(status, code, 'The notification could not be retried.');
    }
  });
}
