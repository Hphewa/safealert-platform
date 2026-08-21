import crypto from 'node:crypto';

import type { UserRole } from '@safealert/contracts';
import jwt, { type SignOptions } from 'jsonwebtoken';

import type { ApiConfig } from '../../../config/env.js';
import { ApiError } from '../../../shared/apiError.js';

type AccessTokenPayload = {
  sub: string;
  role: UserRole;
};

export function signAccessToken(config: ApiConfig, user: { id: string; role: UserRole }) {
  const expiresIn = config.jwtAccessExpiresIn as NonNullable<SignOptions['expiresIn']>;
  const options: SignOptions = {
    subject: user.id,
    expiresIn
  };

  return jwt.sign({ role: user.role }, config.jwtAccessSecret, options);
}

export function verifyAccessToken(config: ApiConfig, token: string): Express.AuthenticatedUser {
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret) as AccessTokenPayload & jwt.JwtPayload;

    if (!payload.sub || !payload.role) {
      throw new ApiError(401, 'INVALID_TOKEN', 'Invalid authentication token.');
    }

    return {
      id: payload.sub,
      role: payload.role
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(401, 'INVALID_TOKEN', 'Invalid authentication token.');
  }
}

export function createRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(config: ApiConfig, refreshToken: string) {
  return crypto
    .createHash('sha256')
    .update(`${refreshToken}.${config.jwtRefreshSecret}`)
    .digest('hex');
}

const durationPattern = /^(\d+)([smhd])$/;

export function expiresAtFromNow(duration: string) {
  const match = durationPattern.exec(duration);

  if (!match) {
    throw new Error('JWT_REFRESH_EXPIRES_IN must use a simple duration such as 30d, 12h, or 60m.');
  }

  const amount = Number.parseInt(match[1] ?? '0', 10);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  } as const;

  return new Date(Date.now() + amount * multipliers[unit as keyof typeof multipliers]);
}
