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
