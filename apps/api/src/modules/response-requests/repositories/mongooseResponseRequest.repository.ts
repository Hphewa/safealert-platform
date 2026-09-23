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

  async acceptResponseRequest(responseRequestId: string, responderId: string) {
    // The status predicate makes acceptance atomic: only one responder can
    // move a still-new request into the assigned state.
    const responseRequest = await ResponseRequestModel.findOneAndUpdate(
      {
        _id: responseRequestId,
        status: 'NEW'
      },
      {
        $set: {
          status: 'ASSIGNED',
          assignedResponderId: responderId
        }
      },
      { new: true }
    ).exec();

    return responseRequest ? toSafeResponseRequest(responseRequest) : null;
  }

  async declineResponseRequest(responseRequestId: string) {
    // Declining is responder-specific and must not cancel the emergency;
    // leaving the request NEW keeps it available to other responders.
    const responseRequest = await ResponseRequestModel.findOne({
      _id: responseRequestId,
      status: 'NEW'
    }).exec();

    return responseRequest ? toSafeResponseRequest(responseRequest) : null;
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
