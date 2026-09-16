import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { isApiError } from './apiError.js';

export function notFoundHandler(request: Request, response: Response) {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route found for ${request.method} ${request.path}.`
    }
  });
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
) {
  void _next;

  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    response.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request is too large. Report photos must be 5 MB or smaller.'
      }
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues[0]?.message ?? 'Invalid request.'
      }
    });
    return;
  }

  if (isApiError(error)) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
  }

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.'
    }
  });
}
