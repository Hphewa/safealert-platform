import { ApiError } from '../../../shared/apiError.js';
import { RefreshSessionModel } from '../../sessions/models/refreshSession.model.js';
import { toSafeUser, UserModel } from '../../users/models/user.model.js';
import type {
  AuthRepository,
  AuthUserRecord,
  CreateUserInput,
  RefreshSessionRecord
} from './auth.repository.js';

function mongoDuplicateEmail(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export class MongooseAuthRepository implements AuthRepository {
  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    try {
      const user = await UserModel.create(input);
      return {
        ...toSafeUser(user),
        passwordHash: input.passwordHash,
        isActive: user.isActive
      };
    } catch (error) {
      if (mongoDuplicateEmail(error)) {
        throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED', 'A user with this email already exists.');
      }

      throw error;
    }
  }

  async findUserByEmailWithPassword(email: string): Promise<AuthUserRecord | null> {
    const user = await UserModel.findOne({ email }).select('+passwordHash').exec();

    if (!user || !user.passwordHash) {
      return null;
    }

    return {
      ...toSafeUser(user),
      passwordHash: user.passwordHash,
      isActive: user.isActive
    };
  }

  async findUserById(id: string) {
    const user = await UserModel.findById(id).exec();
    return user ? toSafeUser(user) : null;
  }

  async createRefreshSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshSessionRecord> {
    const session = await RefreshSessionModel.create(input);

    const record: RefreshSessionRecord = {
      id: session._id.toString(),
      userId: session.userId.toString(),
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt
    };

    if (session.revokedAt) {
      record.revokedAt = session.revokedAt;
    }

    if (session.replacedByTokenHash) {
      record.replacedByTokenHash = session.replacedByTokenHash;
    }

    return record;
  }

  async findRefreshSessionByHash(tokenHash: string): Promise<RefreshSessionRecord | null> {
    const session = await RefreshSessionModel.findOne({ tokenHash }).exec();

    if (!session) {
      return null;
    }

    const record: RefreshSessionRecord = {
      id: session._id.toString(),
      userId: session.userId.toString(),
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt
    };

    if (session.revokedAt) {
      record.revokedAt = session.revokedAt;
    }

    if (session.replacedByTokenHash) {
      record.replacedByTokenHash = session.replacedByTokenHash;
    }

    return record;
  }

  async revokeRefreshSession(tokenHash: string, replacedByTokenHash?: string): Promise<void> {
    await RefreshSessionModel.updateOne(
      { tokenHash, revokedAt: { $exists: false } },
      {
        revokedAt: new Date(),
        ...(replacedByTokenHash ? { replacedByTokenHash } : {})
      }
    ).exec();
  }
}
