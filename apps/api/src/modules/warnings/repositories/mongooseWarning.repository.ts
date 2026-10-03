import { WarningModel, toSafeWarning } from '../models/warning.model.js';
import type { CreateWarningInput, UpdateWarningInput, WarningRepository } from './warning.repository.js';

export class MongooseWarningRepository implements WarningRepository {
  async create(input: CreateWarningInput) {
    return toSafeWarning(await WarningModel.create(input));
  }
  async findById(id: string) {
    const warning = await WarningModel.findById(id).exec();
    return warning ? toSafeWarning(warning) : null;
  }
  async findByAssessmentIds(assessmentIds: string[]) {
    if (assessmentIds.length === 0) return [];
    const warnings = await WarningModel.find({ assessmentId: { $in: assessmentIds } }).exec();
    return warnings.map(toSafeWarning);
  }
  async findByAssessmentId(assessmentId: string) {
    const warning = await WarningModel.findOne({ assessmentId }).sort({ createdAt: -1 }).exec();
    return warning ? toSafeWarning(warning) : null;
  }
  async publish(id: string, publishedById: string, publishedAt: string, notificationTarget: Parameters<WarningRepository['publish']>[3]) {
    if (notificationTarget.scope === 'WHOLE_COUNTRY') notificationTarget = { scope: 'WHOLE_COUNTRY', country: 'Sri Lanka' };
    const warning = await WarningModel.findOneAndUpdate(
      { _id: id, status: 'DRAFT', affectedArea: { $type: 'string', $ne: '' } },
      { $set: { status: 'PUBLISHED', publishedAt: new Date(publishedAt), publishedById, notificationTarget } },
      { new: true }
    ).exec();
    return warning ? toSafeWarning(warning) : null;
  }
  async update(id: string, changes: UpdateWarningInput) {
    if (Object.keys(changes).length === 0) return this.findById(id);
    // LDFEW-115: the status guard repeats the lifecycle rule at the database
    // level so a concurrent transition cannot be overwritten by a content edit.
    const warning = await WarningModel.findOneAndUpdate(
      { _id: id, status: 'DRAFT' },
      { $set: { ...changes } },
      { new: true, runValidators: true }
    ).exec();
    return warning ? toSafeWarning(warning) : null;
  }
  async cancel(id: string, cancelledById: string, cancelledAt: string) {
    const warning = await WarningModel.findOneAndUpdate(
      { _id: id, status: { $in: ['DRAFT', 'PUBLISHED'] } },
      { $set: { status: 'CANCELLED', cancelledById, cancelledAt: new Date(cancelledAt) } },
      { new: true, runValidators: true }
    ).exec();
    return warning ? toSafeWarning(warning) : null;
  }
  async archive(id: string, archivedById: string, archivedAt: string) {
    const warning = await WarningModel.findOneAndUpdate(
      { _id: id, status: 'CANCELLED' },
      { $set: { status: 'ARCHIVED', archivedById, archivedAt: new Date(archivedAt) } },
      { new: true, runValidators: true }
    ).exec();
    return warning ? toSafeWarning(warning) : null;
  }
}

