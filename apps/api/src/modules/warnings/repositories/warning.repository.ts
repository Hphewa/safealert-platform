import type { SafeWarning } from '@safealert/contracts';

export type CreateWarningInput = Omit<SafeWarning, 'id' | 'createdAt' | 'updatedAt'>;
export interface WarningRepository {
  create(input: CreateWarningInput): Promise<SafeWarning>;
}
