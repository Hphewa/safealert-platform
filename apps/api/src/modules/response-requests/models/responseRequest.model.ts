import {
  EMERGENCY_ASSISTANCE_TYPES,
  RESPONSE_STATUSES,
  ROAD_ACCESSIBILITIES,
  type SafeResponseRequest
} from '@safealert/contracts';
import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const geoJsonPointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(value: number[]) {
          if (!Array.isArray(value) || value.length !== 2) {
            return false;
          }

          const [longitude, latitude] = value;
          return (
            typeof longitude === 'number' &&
            longitude >= -180 &&
            longitude <= 180 &&
            typeof latitude === 'number' &&
            latitude >= -90 &&
            latitude <= 90
          );
        },
        message: 'Location coordinates must be [longitude, latitude].'
      }
    }
  },
  {
    _id: false
  }
);

const vulnerablePeopleSchema = new mongoose.Schema(
  {
    children: {
      type: Number,
      required: true,
      min: 0
    },
    elderlyPeople: {
      type: Number,
      required: true,
      min: 0
    },
    personsWithDisabilities: {
      type: Number,
      required: true,
      min: 0
    },
    pregnantPersons: {
      type: Number,
      required: true,
      min: 0
    }
  },
  {
    _id: false
  }
);

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      minlength: 7,
      maxlength: 32
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 320
    }
  },
  {
    _id: false
  }
);

const responseRequestSchema = new mongoose.Schema(
  {
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true
    },
    // Optional until a responder accepts or is assigned the request.
    assignedResponderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    // Preserve which responders declined so the same request can later be
    // excluded from only those responders' pending queues.
    declinedByResponderIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      ],
      default: []
    },
    acceptedAt: {
      type: Date
    },
    dispatchedAt: {
      type: Date
    },
    arrivedAt: {
      type: Date
    },
    inProgressAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    cancelledAt: {
      type: Date
    },
    // LDFEW-266: Operational field notes recorded by the assigned Emergency Responder
    fieldNotes: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    // LDFEW-266: Server timestamp recorded when field notes are persisted
    fieldUpdatedAt: {
      type: Date
    },
    // LDFEW-266: Summary of assistance delivered upon request completion
    assistanceProvided: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    // LDFEW-266: Overall outcome and resolution summary
    completionSummary: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    // LDFEW-266: Optional responder-specific operational remarks
    responderRemarks: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    assistanceType: {
      type: String,
      required: true,
      enum: EMERGENCY_ASSISTANCE_TYPES
    },
    location: {
      type: geoJsonPointSchema,
      required: true
    },
    affectedPeople: {
      type: Number,
      required: true,
      min: 1
    },
    medicalNeeds: {
      type: Boolean,
      required: true
    },
    injuredPeople: {
      type: Number,
      required: true,
      min: 0
    },
    vulnerablePeople: {
      type: vulnerablePeopleSchema,
      required: true
    },
    roadAccessibility: {
      type: String,
      required: true,
      enum: ROAD_ACCESSIBILITIES
    },
    contact: {
      type: contactSchema,
      required: true
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 1000
    },
    specialRequirements: {
      type: String,
      trim: true,
      maxlength: 500
    },
    status: {
      type: String,
      required: true,
      enum: RESPONSE_STATUSES,
      default: 'NEW'
    }
  },
  {
    timestamps: true
  }
);

responseRequestSchema.index({ location: '2dsphere' });

export type ResponseRequestDocument = InferSchemaType<typeof responseRequestSchema> & {
  _id: { toString(): string };
  residentId: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
};

export const ResponseRequestModel =
  (mongoose.models.ResponseRequest as Model<ResponseRequestDocument> | undefined) ??
  mongoose.model<ResponseRequestDocument>('ResponseRequest', responseRequestSchema);

export function toSafeResponseRequest(responseRequest: ResponseRequestDocument): SafeResponseRequest {
  const safeResponseRequest: SafeResponseRequest = {
    id: responseRequest._id.toString(),
    residentId: responseRequest.residentId.toString(),
    assistanceType: responseRequest.assistanceType,
    location: {
      type: 'Point',
      coordinates: [
        responseRequest.location.coordinates[0] ?? 0,
        responseRequest.location.coordinates[1] ?? 0
      ]
    },
    affectedPeople: responseRequest.affectedPeople,
    medicalNeeds: responseRequest.medicalNeeds,
    injuredPeople: responseRequest.injuredPeople,
    vulnerablePeople: {
      children: responseRequest.vulnerablePeople.children,
      elderlyPeople: responseRequest.vulnerablePeople.elderlyPeople,
      personsWithDisabilities: responseRequest.vulnerablePeople.personsWithDisabilities,
      pregnantPersons: responseRequest.vulnerablePeople.pregnantPersons
    },
    roadAccessibility: responseRequest.roadAccessibility,
    contact: {
      name: responseRequest.contact.name,
      phoneNumber: responseRequest.contact.phoneNumber,
      ...(responseRequest.contact.email ? { email: responseRequest.contact.email } : {})
    },
    description: responseRequest.description,
    status: responseRequest.status,
    createdAt: responseRequest.createdAt.toISOString(),
    updatedAt: responseRequest.updatedAt.toISOString()
  };

  safeResponseRequest.declinedByResponderIds = (responseRequest.declinedByResponderIds ?? []).map(
    (responderId) => responderId.toString()
  );

  if (responseRequest.assignedResponderId) {
    safeResponseRequest.assignedResponderId = responseRequest.assignedResponderId.toString();
  }

  if (responseRequest.acceptedAt) {
    safeResponseRequest.acceptedAt = responseRequest.acceptedAt.toISOString();
  }

  if (responseRequest.dispatchedAt) {
    safeResponseRequest.dispatchedAt = responseRequest.dispatchedAt.toISOString();
  }

  if (responseRequest.arrivedAt) {
    safeResponseRequest.arrivedAt = responseRequest.arrivedAt.toISOString();
  }

  if (responseRequest.inProgressAt) {
    safeResponseRequest.inProgressAt = responseRequest.inProgressAt.toISOString();
  }

  if (responseRequest.completedAt) {
    safeResponseRequest.completedAt = responseRequest.completedAt.toISOString();
  }

  if (responseRequest.cancelledAt) {
    safeResponseRequest.cancelledAt = responseRequest.cancelledAt.toISOString();
  }

  // LDFEW-266: Map responder field notes and completion fields safely for clients
  if (responseRequest.fieldNotes) {
    safeResponseRequest.fieldNotes = responseRequest.fieldNotes;
  }

  if (responseRequest.fieldUpdatedAt) {
    safeResponseRequest.fieldUpdatedAt = responseRequest.fieldUpdatedAt.toISOString();
  }

  if (responseRequest.assistanceProvided) {
    safeResponseRequest.assistanceProvided = responseRequest.assistanceProvided;
  }

  if (responseRequest.completionSummary) {
    safeResponseRequest.completionSummary = responseRequest.completionSummary;
  }

  if (responseRequest.responderRemarks) {
    safeResponseRequest.responderRemarks = responseRequest.responderRemarks;
  }

  if (responseRequest.specialRequirements) {
    safeResponseRequest.specialRequirements = responseRequest.specialRequirements;
  }

  return safeResponseRequest;
}
