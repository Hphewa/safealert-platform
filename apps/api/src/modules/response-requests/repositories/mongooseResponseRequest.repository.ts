import { RESPONSE_ACTIVE_ASSIGNED_STATUSES, RESPONSE_CANCELLABLE_STATUS, RESPONSE_EDITABLE_STATUS, type ResponseStatus, type UpdateResponseRequestRequest } from '@safealert/contracts';
import mongoose from 'mongoose';

import { ResponseRequestModel, toSafeResponseRequest } from '../models/responseRequest.model.js';
import { residentEditableFields, responseProgressTimestampFields } from './responseRequest.repository.js';
import type {
  CreateResponseRequestInput,
  ResponseRequestRepository
} from './responseRequest.repository.js';

export class MongooseResponseRequestRepository implements ResponseRequestRepository {
  async createResponseRequest(input: CreateResponseRequestInput) {
    const responseRequest = await ResponseRequestModel.create(input);
    return toSafeResponseRequest(responseRequest);
  }

  async updateResidentResponseRequest(responseRequestId: string, residentId: string, input: UpdateResponseRequestRequest) {
    const fields = residentEditableFields(input);
    // Ownership and NEW must still match at write time, even if a responder
    // accepted the request after the Resident opened or submitted the edit form.
    const responseRequest = await ResponseRequestModel.findOneAndUpdate(
      { _id: responseRequestId, residentId, status: RESPONSE_EDITABLE_STATUS },
      {
        $set: fields,
        // A full edit can clear optional notes; omission must not retain old text.
        ...(!fields.specialRequirements ? { $unset: { specialRequirements: 1 } } : {})
      },
      { new: true, runValidators: true }
    ).exec();
    return responseRequest ? toSafeResponseRequest(responseRequest) : null;
  }

  async findResponseRequestsByResidentId(residentId: string) {
    // Ownership is part of the database query; completed requests remain trackable too.
    const responseRequests = await ResponseRequestModel.find({ residentId })
      .sort({ createdAt: -1, _id: -1 })
      .exec();

    return responseRequests.map(toSafeResponseRequest);
  }

  async findPendingResponseRequests(responderId: string) {
    if (!mongoose.isValidObjectId(responderId)) {
      return [];
    }

    // Exclude only requests declined by this responder. Other responders must
    // still see NEW requests so they can assist with the emergency.
    const responseRequests = await ResponseRequestModel.find({
      // Cancelled records remain stored for history; only NEW work belongs in Pending.
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
      // An explicit active list excludes CANCELLED, COMPLETED and unknown statuses
      // without removing the records needed for Resident tracking and history.
      status: { $in: RESPONSE_ACTIVE_ASSIGNED_STATUSES },
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

  async findResponseRequestForCancellation(responseRequestId: string) {
    // The service must distinguish missing requests from ownership failures;
    // this internal lookup must never be returned before authorization.
    const responseRequest = await ResponseRequestModel.findById(responseRequestId).exec();
    return responseRequest ? toSafeResponseRequest(responseRequest) : null;
  }

  async cancelResponseRequest(responseRequestId: string, residentId: string) {
    // Recheck ownership and eligibility in the write so concurrent responder
    // acceptance cannot be overwritten after the service's initial read.
    const responseRequest = await ResponseRequestModel.findOneAndUpdate(
      { _id: responseRequestId, residentId, status: RESPONSE_CANCELLABLE_STATUS },
      // Preserve the original record for tracking/audit. The server owns lifecycle
      // time; Mongoose maintains updatedAt without changing the submission time.
      { $set: { status: 'CANCELLED', cancelledAt: new Date() } },
      { new: true, runValidators: true }
    ).exec();

    return responseRequest ? toSafeResponseRequest(responseRequest) : null;
  }

  async findResponseRequestForProgress(responseRequestId: string) {
    const responseRequest = await ResponseRequestModel.findById(responseRequestId).exec();
    return responseRequest ? toSafeResponseRequest(responseRequest) : null;
  }

  async updateResponseRequestProgress(
    responseRequestId: string,
    responderId: string,
    currentStatus: ResponseStatus,
    nextStatus: ResponseStatus
  ) {
    const timestampField = responseProgressTimestampFields[nextStatus];

    if (!timestampField) {
      return null;
    }

    // Recheck assignment and status atomically so a stale update cannot overwrite progress.
    const responseRequest = await ResponseRequestModel.findOneAndUpdate(
      {
        _id: responseRequestId,
        assignedResponderId: responderId,
        status: currentStatus
      },
      // Status and its server timestamp must succeed or fail together.
      { $set: { status: nextStatus, [timestampField]: new Date() } },
      { new: true, runValidators: true }
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
