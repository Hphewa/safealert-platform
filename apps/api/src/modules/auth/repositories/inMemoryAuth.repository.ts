import crypto from 'node:crypto';

import { ApiError } from '../../../shared/apiError.js';
import type {
  AuthRepository,
  AuthUserRecord,
  CreateUserInput,
  RefreshSessionRecord
} from './auth.repository.js';

export class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, AuthUserRecord>();
  private readonly refreshSessions = new Map<string, RefreshSessionRecord>();

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    const email = input.email.toLowerCase();

    if ([...this.users.values()].some((user) => user.email === email)) {
      throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED', 'A user with this email already exists.');
    }

    const user: AuthUserRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      email,
      passwordHash: input.passwordHash,
      role: input.role,
      isActive: true
    };

    this.users.set(user.id, user);
    return user;
  }

  async findUserByEmailWithPassword(email: string): Promise<AuthUserRecord | null> {
    return [...this.users.values()].find((user) => user.email === email.toLowerCase()) ?? null;
  }

  async findUserById(id: string) {
    const user = this.users.get(id);

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };
  }

  async createRefreshSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshSessionRecord> {
    const session: RefreshSessionRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt
    };

    this.refreshSessions.set(session.tokenHash, session);
    return session;
  }

  async findRefreshSessionByHash(tokenHash: string): Promise<RefreshSessionRecord | null> {
    return this.refreshSessions.get(tokenHash) ?? null;
  }

  async revokeRefreshSession(tokenHash: string, replacedByTokenHash?: string): Promise<void> {
    const session = this.refreshSessions.get(tokenHash);

    if (session && !session.revokedAt) {
      session.revokedAt = new Date();

      if (replacedByTokenHash) {
        session.replacedByTokenHash = replacedByTokenHash;
      }
    }
  }

  setUserActive(email: string, isActive: boolean) {
    const user = [...this.users.values()].find((candidate) => candidate.email === email.toLowerCase());

    if (user) {
      user.isActive = isActive;
    }
  }
}
