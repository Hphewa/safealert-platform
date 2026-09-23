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

  if (responseRequest.specialRequirements) {
    safeResponseRequest.specialRequirements = responseRequest.specialRequirements;
  }

  return safeResponseRequest;
}
