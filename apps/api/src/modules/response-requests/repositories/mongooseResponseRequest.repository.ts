import type { ResponseStatus } from '@safealert/contracts';
import mongoose from 'mongoose';

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

  async findPendingResponseRequests(responderId: string) {
    if (!mongoose.isValidObjectId(responderId)) {
      return [];
    }

    // Exclude only requests declined by this responder. Other responders must
    // still see NEW requests so they can assist with the emergency.
    const responseRequests = await ResponseRequestModel.find({
      status: 'NEW',
      declinedByResponderIds: {
        $nin: [responderId]
      }
    })
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
    if (!mongoose.isValidObjectId(responseRequestId) || !mongoose.isValidObjectId(responderId)) {
      return null;
    }

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
          assignedResponderId: responderId,
          acceptedAt: new Date()
        }
      },
      { new: true }
    ).exec();

    return responseRequest ? toSafeResponseRequest(responseRequest) : null;
  }

  async declineResponseRequest(responseRequestId: string, responderId: string) {
    if (!mongoose.isValidObjectId(responseRequestId) || !mongoose.isValidObjectId(responderId)) {
      return null;
    }

    // Declining is responder-specific and must not cancel the emergency;
    // leaving the request NEW keeps it available to other responders.
    const responseRequest = await ResponseRequestModel.findOneAndUpdate(
      {
        _id: responseRequestId,
        status: 'NEW'
      },
      {
        $addToSet: {
          declinedByResponderIds: responderId
        }
      },
      { new: true }
    ).exec();

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
