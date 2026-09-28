import type { AcknowledgeWarningResponse, ResidentWarning, ResidentWarningResponse, ResidentWarningsResponse, SafeWarning } from '@safealert/contracts';
import { normalizeNotificationLocation } from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import { UserModel } from '../../users/models/user.model.js';
import { WarningAcknowledgementModel } from '../models/warningAcknowledgement.model.js';
import { WarningModel, toSafeWarning } from '../models/warning.model.js';

function target(warning: SafeWarning) {
  if (warning.notificationTarget?.scope === 'DISTRICT') return ['district', normalizeNotificationLocation(warning.notificationTarget.district)] as const;
  if (warning.notificationTarget?.scope === 'WHOLE_COUNTRY') return ['country', normalizeNotificationLocation(warning.notificationTarget.country ?? 'Sri Lanka')] as const;
  return ['area', normalizeNotificationLocation(warning.affectedArea)] as const;
}

export class ResidentWarningService {
  private async isEligible(warning: SafeWarning, residentId: string) {
    const [field, expected] = target(warning);
    if (!expected) return false;
    const resident = await UserModel.findOne({ _id: residentId, role: 'RESIDENT', isActive: true }).select(field).lean().exec() as Record<string, unknown> | null;
    return resident ? normalizeNotificationLocation(String(resident[field] ?? '')) === expected : false;
  }

  private async withAcknowledgement(warning: SafeWarning, residentId: string): Promise<ResidentWarning> {
    const record = await WarningAcknowledgementModel.findOne({ warningId: warning.id, residentId }).lean().exec();
    return { ...warning, ...(record ? { acknowledgedAt: record.acknowledgedAt.toISOString() } : {}) };
  }

  async list(residentId: string): Promise<ResidentWarningsResponse> {
    const published = await WarningModel.find({ status: 'PUBLISHED' }).sort({ publishedAt: -1 }).lean().exec();
    const result: ResidentWarning[] = [];
    for (const item of published) {
      const warning = toSafeWarning(item as never);
      if (await this.isEligible(warning, residentId)) result.push(await this.withAcknowledgement(warning, residentId));
    }
    return { warnings: result };
  }

  async get(residentId: string, warningId: string): Promise<ResidentWarningResponse> {
    const item = await WarningModel.findOne({ _id: warningId, status: 'PUBLISHED' }).exec();
    if (!item) throw new ApiError(404, 'WARNING_NOT_FOUND', 'Warning not found.');
    const warning = toSafeWarning(item);
    if (!(await this.isEligible(warning, residentId))) throw new ApiError(404, 'WARNING_NOT_FOUND', 'Warning not found.');
    return { warning: await this.withAcknowledgement(warning, residentId) };
  }

  async acknowledge(residentId: string, warningId: string): Promise<AcknowledgeWarningResponse> {
    const item = await WarningModel.findOne({ _id: warningId, status: 'PUBLISHED' }).exec();
    if (!item) throw new ApiError(404, 'WARNING_NOT_FOUND', 'Warning not found.');
    const warning = toSafeWarning(item);
    if (!(await this.isEligible(warning, residentId))) throw new ApiError(404, 'WARNING_NOT_FOUND', 'Warning not found.');
    const record = await WarningAcknowledgementModel.findOneAndUpdate(
      { warningId, residentId },
      { $setOnInsert: { warningId, residentId, acknowledgedAt: new Date() } },
      { upsert: true, new: true }
    ).exec();
    return { warningId, acknowledgedAt: record.acknowledgedAt.toISOString() };
  }
}
