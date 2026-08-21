import type { RequestHandler } from 'express';

import type { ApiConfig } from '../config/env.js';
import { ApiError } from '../shared/apiError.js';
import { verifyAccessToken } from '../modules/auth/services/token.service.js';

export function authenticate(config: ApiConfig): RequestHandler {
  return (request, _response, next) => {
    const authorizationHeader = request.header('authorization');

    if (!authorizationHeader?.startsWith('Bearer ')) {
      next(new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.'));
      return;
    }

    const token = authorizationHeader.slice('Bearer '.length).trim();

    if (!token) {
      next(new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.'));
      return;
    }

    try {
      request.auth = verifyAccessToken(config, token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
