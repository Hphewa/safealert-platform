import type { ResponseStatus } from '@safealert/contracts';

import { ResponseRequestModel, toSafeResponseRequest } from '../models/responseRequest.model.js';
import type {
  CreateResponseRequestInput,
  ResponseRequestRepository
} from './responseRequest.repository.js';

export class MongooseResponseRequestRepository implements ResponseRequestRepository {
  async createResponseRequest(input: CreateResponseRequestInput) {
    const responseRequest = await ResponseRequestModel.create(input);
    return toSafeResponseRequest(responseRequest);
  }

  async findPendingResponseRequests() {
    // NEW requests have not yet been assigned to a responder, so they form
    // the pending emergency-request queue.
    const responseRequests = await ResponseRequestModel.find({ status: 'NEW' })
      // Keep the queue deterministic by showing the most recently submitted
      // emergency requests first until priority scoring is implemented.
      .sort({ createdAt: -1 })
      .exec();

    return responseRequests.map(toSafeResponseRequest);
  }

  async findAssignedResponseRequests(responderId: string) {
    // Scope assigned requests to the current responder so one responder
    // cannot view another responder's active workload.
    const responseRequests = await ResponseRequestModel.find({
      status: 'ASSIGNED',
      assignedResponderId: responderId
    })
      .sort({ createdAt: -1 })
      .exec();

    return responseRequests.map(toSafeResponseRequest);
  }

  async findResponseRequestById(
    responseRequestId: string,
    residentId: string,
    statuses?: ResponseStatus[]
  ) {
    const filter = {
      _id: responseRequestId,
      residentId,
      ...(statuses?.length
        ? {
            status: {
              $in: statuses
            }
          }
        : {})
    };
    const responseRequest = await ResponseRequestModel.findOne(filter).exec();

    if (!responseRequest) {
      return null;
    }

    return toSafeResponseRequest(responseRequest);
  }
}
