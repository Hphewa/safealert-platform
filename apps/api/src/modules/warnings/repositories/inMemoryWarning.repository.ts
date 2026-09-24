import { randomBytes } from 'node:crypto';
import type { SafeWarning } from '@safealert/contracts';
import type { CreateWarningInput, WarningRepository } from './warning.repository.js';

export class InMemoryWarningRepository implements WarningRepository {
  readonly warnings = new Map<string, SafeWarning>();
  async create(input: CreateWarningInput): Promise<SafeWarning> {
    const timestamp = new Date().toISOString();
    const warning = { ...input, id: randomBytes(12).toString('hex'), createdAt: timestamp, updatedAt: timestamp };
    this.warnings.set(warning.id, warning);
    return warning;
  }
}
