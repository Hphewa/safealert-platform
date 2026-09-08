import type { UserRole } from '@safealert/contracts';

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      role: UserRole;
    }

    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export {};
