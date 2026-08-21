import type { SafeUser, UserRole } from '@safealert/contracts';

export type AuthUserRecord = SafeUser & {
  passwordHash: string;
  isActive: boolean;
};

export type RefreshSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedByTokenHash?: string;
};

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
};

export interface AuthRepository {
  createUser(input: CreateUserInput): Promise<AuthUserRecord>;
  findUserByEmailWithPassword(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<SafeUser | null>;
  createRefreshSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshSessionRecord>;
  findRefreshSessionByHash(tokenHash: string): Promise<RefreshSessionRecord | null>;
  revokeRefreshSession(tokenHash: string, replacedByTokenHash?: string): Promise<void>;
}
