import { WarningModel, toSafeWarning } from '../models/warning.model.js';
import type { CreateWarningInput, WarningRepository } from './warning.repository.js';

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
}

