import type { RequestHandler } from 'express';
import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { NotificationProfileService } from '../services/notificationProfile.service.js';
import { updateNotificationProfileSchema } from '../validation/notification.schemas.js';

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