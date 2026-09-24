import { WarningModel, toSafeWarning } from '../models/warning.model.js';
import type { CreateWarningInput, WarningRepository } from './warning.repository.js';

export class MongooseWarningRepository implements WarningRepository {
  async create(input: CreateWarningInput) {
    return toSafeWarning(await WarningModel.create(input));
  }
}
