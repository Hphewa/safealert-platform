import type { FieldConfirmation } from '@safealert/contracts';
import { FieldConfirmationModel } from '../models/fieldConfirmation.model.js';
import type { CreateFieldConfirmationInput, FieldConfirmationRepository } from './fieldConfirmation.repository.js';

function serialize(document: InstanceType<typeof FieldConfirmationModel>): FieldConfirmation {
  const common = {
    id: document._id.toString(), reportId: document.reportId.toString(),
    volunteerId: document.volunteerId.toString(), status: 'PENDING' as const,
    createdAt: document.createdAt.toISOString(), updatedAt: document.updatedAt.toISOString()
  };
  if (document.outcome === 'UNABLE_TO_CONFIRM') {
    return { ...common, outcome: 'UNABLE_TO_CONFIRM', reason: document.reason!,
      ...(document.reasonDetails ? { reasonDetails: document.reasonDetails } : {}) };
  }
  return {
    ...common,
    outcome: 'CONFIRMED',
    verificationChecklist: {
      locationMatches: Boolean(document.verificationChecklist?.locationMatches),
      photoMatches: Boolean(document.verificationChecklist?.photoMatches),
      situationStillExists: Boolean(document.verificationChecklist?.situationStillExists),
      severityAppearsCorrect: Boolean(document.verificationChecklist?.severityAppearsCorrect)
    },
    ...(document.observation ? { observation: document.observation } : {}),
    ...(document.mediaReference ? { mediaReference: document.mediaReference } : {})
  };
}
export class MongooseFieldConfirmationRepository implements FieldConfirmationRepository {
  async create(input: CreateFieldConfirmationInput) {
    return serialize(await FieldConfirmationModel.create({ ...input, status: 'PENDING' }));
  }
  async findByReportId(reportId: string) {
    return (await FieldConfirmationModel.find({ reportId }).sort({ createdAt: -1 })).map(serialize);
  }
  async findByVolunteerId(volunteerId: string) {
    return (await FieldConfirmationModel.find({ volunteerId }).sort({ createdAt: -1 })).map(serialize);
  }
  async findByReportIdAndVolunteerId(reportId: string, volunteerId: string) {
    const document = await FieldConfirmationModel.findOne({ reportId, volunteerId }).exec();
    return document ? serialize(document) : null;
  }
}
