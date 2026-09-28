import type { UserRole } from '@safealert/contracts';
import type { RequestHandler } from 'express';

import { ApiError } from '../shared/apiError.js';

export function authorizeRoles(...allowedRoles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.'));
      return;
    }

    if (!allowedRoles.includes(request.auth.role)) {
      next(new ApiError(403, 'FORBIDDEN', 'You are not allowed to perform this action.'));
      return;
    }

    next();
  };
}
