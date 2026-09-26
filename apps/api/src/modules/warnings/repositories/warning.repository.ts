import type { SafeWarning } from '@safealert/contracts';

export type CreateWarningInput = Omit<SafeWarning, 'id' | 'createdAt' | 'updatedAt'>;
export interface WarningRepository {
  create(input: CreateWarningInput): Promise<SafeWarning>;
  findById(id: string): Promise<SafeWarning | null>;
  publish(id: string, publishedById: string, publishedAt: string): Promise<SafeWarning | null>;
}
