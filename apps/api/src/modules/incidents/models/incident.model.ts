import { HAZARD_TYPES, INCIDENT_MAX_REPORTS, INCIDENT_STATUSES, type SafeIncident } from '@safealert/contracts';
import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const incidentLocationSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], required: true, default: 'Point' },
  coordinates: {
    type: [Number], required: true,
    validate: {
      validator(coordinates: number[]) {
        if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;
        const [longitude, latitude] = coordinates;
        return Number.isFinite(longitude) && longitude! >= -180 && longitude! <= 180
          && Number.isFinite(latitude) && latitude! >= -90 && latitude! <= 90;
      },
      message: 'Location must contain valid [longitude, latitude] coordinates.'
    }
  }
}, { _id: false });

const incidentSchema = new mongoose.Schema({
  hazardType: { type: String, enum: HAZARD_TYPES, required: true },
  // Representative location from the first selected report, not a computed disaster boundary.
  location: { type: incidentLocationSchema, required: true },
  reportIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }], required: true,
    validate: {
      validator(ids: mongoose.Types.ObjectId[]) {
        return Array.isArray(ids) && ids.length > 0 && ids.length <= INCIDENT_MAX_REPORTS
          && ids.every((id) => id != null)
          && new Set(ids.map((id) => id.toString())).size === ids.length;
      },
      message: `An incident must reference 1-${INCIDENT_MAX_REPORTS} distinct reports.`
    }
  },
  status: { type: String, enum: INCIDENT_STATUSES, required: true, default: 'ACTIVE' },
  createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

incidentSchema.index({ location: '2dsphere' });
// A multikey index reserves each report ID across ACTIVE documents, including racing inserts.
// Repeated IDs within one document need the separate validator above.
incidentSchema.index({ reportIds: 1 }, {
  unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'one_active_incident_per_report'
});

type IncidentDocument = InferSchemaType<typeof incidentSchema> & { _id: mongoose.Types.ObjectId };
export const IncidentModel =
  (mongoose.models.Incident as Model<IncidentDocument> | undefined) ??
  mongoose.model<IncidentDocument>('Incident', incidentSchema);

export function toSafeIncident(incident: IncidentDocument): SafeIncident {
  return {
    id: incident._id.toString(), hazardType: incident.hazardType,
    location: { type: 'Point', coordinates: [incident.location.coordinates[0]!, incident.location.coordinates[1]!] },
    reportIds: incident.reportIds.map((id) => id.toString()), status: incident.status,
    createdById: incident.createdById.toString(),
    createdAt: incident.createdAt.toISOString(), updatedAt: incident.updatedAt.toISOString()
  };
}
