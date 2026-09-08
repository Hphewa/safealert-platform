import bcrypt from 'bcryptjs';

import type {
  AuthResponse,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  SafeUser
} from '@safealert/contracts';

import type { ApiConfig } from '../../../config/env.js';
import { ApiError } from '../../../shared/apiError.js';
import type { AuthRepository } from '../repositories/auth.repository.js';
import {
  createRefreshToken,
  expiresAtFromNow,
  hashRefreshToken,
  signAccessToken
} from './token.service.js';

const passwordHashRounds = 12;

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: ApiConfig
  ) {}

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const existingUser = await this.repository.findUserByEmailWithPassword(input.email);

    if (existingUser) {
      throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED', 'A user with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(input.password, passwordHashRounds);
    const user = await this.repository.createUser({
      name: input.name,
      email: input.email,
      passwordHash,
      role: 'RESIDENT'
    });

    return this.createAuthResponse(user);
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const user = await this.repository.findUserByEmailWithPassword(input.email);

    if (!user || !user.isActive) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    return this.createAuthResponse(user);
  }

  async refresh(input: RefreshRequest): Promise<AuthResponse> {
    const currentTokenHash = hashRefreshToken(this.config, input.refreshToken);
    const currentSession = await this.repository.findRefreshSessionByHash(currentTokenHash);

    if (!currentSession || currentSession.revokedAt || currentSession.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(401, 'INVALID_REFRESH_SESSION', 'Refresh session is invalid or expired.');
    }

    const user = await this.repository.findUserById(currentSession.userId);

    if (!user) {
      throw new ApiError(401, 'INVALID_REFRESH_SESSION', 'Refresh session is invalid or expired.');
    }

    const nextRefreshToken = createRefreshToken();
    const nextRefreshTokenHash = hashRefreshToken(this.config, nextRefreshToken);

    await this.repository.revokeRefreshSession(currentTokenHash, nextRefreshTokenHash);
    await this.repository.createRefreshSession({
      userId: user.id,
      tokenHash: nextRefreshTokenHash,
      expiresAt: expiresAtFromNow(this.config.jwtRefreshExpiresIn)
    });

    return {
      user,
      accessToken: signAccessToken(this.config, user),
      refreshToken: nextRefreshToken
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(this.config, refreshToken);
    await this.repository.revokeRefreshSession(tokenHash);
  }

  async me(userId: string): Promise<SafeUser> {
    const user = await this.repository.findUserById(userId);

    if (!user) {
      throw new ApiError(401, 'INVALID_TOKEN', 'Invalid authentication token.');
    }

    return user;
  }

  private async createAuthResponse(user: SafeUser): Promise<AuthResponse> {
    const safeUser: SafeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };
    const refreshToken = createRefreshToken();
    const tokenHash = hashRefreshToken(this.config, refreshToken);

    await this.repository.createRefreshSession({
      userId: safeUser.id,
      tokenHash,
      expiresAt: expiresAtFromNow(this.config.jwtRefreshExpiresIn)
    });

    return {
      user: safeUser,
      accessToken: signAccessToken(this.config, safeUser),
      refreshToken
    };
  }
}
