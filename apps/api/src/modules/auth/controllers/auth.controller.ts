import type { RequestHandler } from 'express';

import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { AuthService } from '../services/auth.service.js';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from '../validation/auth.schemas.js';

export function createAuthController(authService: AuthService) {
  const register: RequestHandler = asyncHandler(async (request, response) => {
    const input = registerSchema.parse(request.body);
    const result = await authService.register(input);
    response.status(201).json(result);
  });

  const login: RequestHandler = asyncHandler(async (request, response) => {
    const input = loginSchema.parse(request.body);
    const result = await authService.login(input);
    response.json(result);
  });

  const refresh: RequestHandler = asyncHandler(async (request, response) => {
    const input = refreshSchema.parse(request.body);
    const result = await authService.refresh(input);
    response.json(result);
  });

  const logout: RequestHandler = asyncHandler(async (request, response) => {
    const input = logoutSchema.parse(request.body);
    await authService.logout(input.refreshToken);
    response.status(204).send();
  });

  const me: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const user = await authService.me(request.auth.id);
    response.json({ user });
  });

  return {
    register,
    login,
    refresh,
    logout,
    me
  };
}
