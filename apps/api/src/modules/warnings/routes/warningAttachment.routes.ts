import { Router, json } from 'express';
import { z } from 'zod';
import { WARNING_IMAGE_MAX_BYTES } from '@safealert/contracts';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import { ApiError } from '../../../shared/apiError.js';
import type { WarningAttachmentService } from '../services/warningAttachment.service.js';

const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'A valid assessment or image ID is required.');
const uploadSchema = z.object({
  assessmentId: idSchema,
  base64: z.string().min(4).max(Math.ceil(WARNING_IMAGE_MAX_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'Invalid image encoding.')
}).strict();

export function createWarningAttachmentRouter(service: WarningAttachmentService, config: ApiConfig) {
  const router = Router();
  router.use(authenticate(config), authorizeRoles('DISASTER_OFFICER'));
  // Only this authenticated upload route accepts a larger JSON body.
  const parse = json({ limit: '7mb' });
  router.post('/', (request, response, next) => parse(request, response, (error?: unknown) => {
    if (error) return next(new ApiError(413, 'INVALID_IMAGE_UPLOAD', 'Upload a valid image of 5 MB or smaller.'));
    next();
  }), asyncHandler(async (request, response) => {
    response.status(201).json(await service.upload(request.auth!.id, uploadSchema.parse(request.body)));
  }));
  router.get('/:imageId', asyncHandler(async (request, response) => {
    const image = await service.read(request.auth!.id, idSchema.parse(request.params.imageId));
    response.set({ 'Content-Type': image.mimeType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    response.send(image.bytes);
  }));
  return router;
}
