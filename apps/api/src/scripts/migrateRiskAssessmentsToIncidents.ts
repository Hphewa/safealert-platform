import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';
import { HAZARD_TYPES, type SafeIncident } from '@safealert/contracts';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

export type LegacyAssessmentRecord = {
  id: string;
  incidentId?: string;
  hazardReportId?: string;
  assessedById?: string | undefined;
  status?: string;
};

export type IncidentReference = {
  id: string;
  reportIds: string[];
  status: string;
};

type MigrationIssue =
  | { assessmentId: string; reason: 'MISSING_RELATIONSHIP' }
  | { assessmentId: string; reason: 'NO_INCIDENT_FOR_REPORT' | 'MULTIPLE_INCIDENTS_FOR_REPORT'; hazardReportId: string }
  | { assessmentId: string; reason: 'ACTIVE_ASSESSMENT_CONFLICT'; incidentId: string };

export type RiskAssessmentMigrationPlan = {
  updates: Array<{ assessmentId: string; incidentId: string }>;
  unresolved: MigrationIssue[];
};

type RecoveryReport = { id: string; status: string; hazardType: string; location: unknown };
type RecoveryIncident = Omit<SafeIncident, 'createdAt' | 'updatedAt'>;

export function serializeAssessmentBackup(value: unknown): string {
  return mongoose.mongo.BSON.EJSON.stringify(value, { relaxed: false });
}

// Recovery is opt-in. A legacy official decision already belongs to one report;
// preserve that scope instead of guessing a nearby incident or merging decisions.
export function planMissingAssessmentIncidents(
  assessments: LegacyAssessmentRecord[], incidents: IncidentReference[], reports: RecoveryReport[]
): RecoveryIncident[] {
  const planned: RecoveryIncident[] = [];
  for (const assessment of assessments) {
    if (assessment.incidentId || !assessment.hazardReportId || !assessment.assessedById) continue;
    if (!mongoose.isObjectIdOrHexString(assessment.id) || !mongoose.isObjectIdOrHexString(assessment.assessedById)) continue;
    if ([...incidents, ...planned].some((incident) => incident.reportIds.includes(assessment.hazardReportId!))) continue;
    if (incidents.some((incident) => incident.id === assessment.id)) continue;
    const report = reports.find((candidate) => candidate.id === assessment.hazardReportId);
    if (!report || report.status !== 'VERIFIED' || !mongoose.isObjectIdOrHexString(report.id)) continue;
    if (!HAZARD_TYPES.some((hazard) => hazard === report.hazardType)) continue;
    const location = report.location as Partial<SafeIncident['location']> | null;
    if (location?.type !== 'Point' || !Array.isArray(location.coordinates) || location.coordinates.length !== 2) continue;
    const [longitude, latitude] = location.coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) continue;
    planned.push({
      id: assessment.id, hazardType: report.hazardType as SafeIncident['hazardType'],
      location: { type: 'Point', coordinates: [longitude, latitude] }, reportIds: [report.id],
      status: assessment.status === 'ACTIVE' ? 'ACTIVE' : 'CLOSED', createdById: assessment.assessedById
    });
  }
  return planned;
}

/**
 * Build a deterministic plan before touching MongoDB. A legacy assessment is
 * migrated only when its report belongs to exactly one Incident. Ambiguous or
 * conflicting records stop the apply phase rather than being guessed or merged.
 */
export function planRiskAssessmentMigration(
  assessments: LegacyAssessmentRecord[], incidents: IncidentReference[]
): RiskAssessmentMigrationPlan {
  const updates: Array<{ assessmentId: string; incidentId: string }> = [];
  const unresolved: MigrationIssue[] = [];
  const activeAssessmentByIncident = new Map<string, string>();

  for (const assessment of assessments) {
    if (assessment.incidentId && assessment.status === 'ACTIVE') {
      const previous = activeAssessmentByIncident.get(assessment.incidentId);
      if (previous) unresolved.push({ assessmentId: assessment.id, reason: 'ACTIVE_ASSESSMENT_CONFLICT', incidentId: assessment.incidentId });
      else activeAssessmentByIncident.set(assessment.incidentId, assessment.id);
    }
  }

  for (const assessment of assessments) {
    if (assessment.incidentId) continue;
    if (!assessment.hazardReportId) {
      unresolved.push({ assessmentId: assessment.id, reason: 'MISSING_RELATIONSHIP' });
      continue;
    }
    const matches = incidents.filter((incident) => incident.reportIds.includes(assessment.hazardReportId!));
    if (matches.length === 0) {
      unresolved.push({ assessmentId: assessment.id, reason: 'NO_INCIDENT_FOR_REPORT', hazardReportId: assessment.hazardReportId });
      continue;
    }
    if (matches.length > 1) {
      unresolved.push({ assessmentId: assessment.id, reason: 'MULTIPLE_INCIDENTS_FOR_REPORT', hazardReportId: assessment.hazardReportId });
      continue;
    }
    const incidentId = matches[0]!.id;
    if (assessment.status === 'ACTIVE') {
      const previous = activeAssessmentByIncident.get(incidentId);
      if (previous) {
        unresolved.push({ assessmentId: assessment.id, reason: 'ACTIVE_ASSESSMENT_CONFLICT', incidentId });
        continue;
      }
      activeAssessmentByIncident.set(incidentId, assessment.id);
    }
    updates.push({ assessmentId: assessment.id, incidentId });
  }

  return { updates: unresolved.some((issue) => issue.reason === 'ACTIVE_ASSESSMENT_CONFLICT') ? [] : updates, unresolved };
}

async function run() {
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) throw new Error('MONGODB_URI is required.');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(mongodbUri, { serverSelectionTimeoutMS: 5000 });
  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB connection did not expose a database.');
    const collection = database.collection('riskassessments');
    const originalAssessments = await collection.find({}, { promoteValues: false }).toArray();
    const assessments = originalAssessments.map((record) => ({
      id: record._id.toString(),
      ...(record.incidentId ? { incidentId: record.incidentId.toString() } : {}),
      ...(record.hazardReportId ? { hazardReportId: record.hazardReportId.toString() } : {}),
      ...(record.assessedById ? { assessedById: record.assessedById.toString() } : {}),
      ...(record.status ? { status: String(record.status) } : {})
    }));
    const incidents = (await database.collection('incidents').find({}, {
      projection: { _id: 1, reportIds: 1, status: 1 }
    }).toArray()).map((incident) => ({
      id: incident._id.toString(), reportIds: (incident.reportIds ?? []).map((id: mongoose.Types.ObjectId) => id.toString()),
      status: String(incident.status ?? '')
    }));
    const reports = (await database.collection('reports').find({ _id: { $in: assessments.flatMap((record) =>
      record.hazardReportId ? [new mongoose.Types.ObjectId(record.hazardReportId)] : []) }
    }, { projection: { status: 1, hazardType: 1, location: 1 } }).toArray()).map((report) => ({
      id: report._id.toString(), status: String(report.status), hazardType: String(report.hazardType), location: report.location
    }));
    const createIncidents = process.argv.includes('--recover-missing-incidents')
      ? planMissingAssessmentIncidents(assessments, incidents, reports) : [];
    const plan = planRiskAssessmentMigration(assessments, [...incidents, ...createIncidents]);
    const indexes = await collection.listIndexes().toArray();
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', createIncidents, ...plan,
      replaceLegacyIndex: indexes.some((index) => index.name === 'one_active_assessment_per_report') }, null, 2));
    if (!apply) return;
    if (plan.unresolved.length) throw new Error('Migration stopped: resolve every unresolved record shown in the plan first.');

    // Keep an exact BSON-preserving backup in ignored build output before any write.
    const backupDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../build/database-backups');
    await mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `risk-assessments-${Date.now()}.json`);
    await writeFile(backupPath, serializeAssessmentBackup({ assessments: originalAssessments, indexes, createIncidents }), { flag: 'wx' });
    console.log(`Backup written to ${backupPath}`);
    if (createIncidents.length) {
      const now = new Date();
      await database.collection('incidents').insertMany(createIncidents.map(({ id, reportIds, createdById, ...incident }) => ({
        ...incident, _id: new mongoose.Types.ObjectId(id),
        reportIds: reportIds.map((reportId) => new mongoose.Types.ObjectId(reportId)),
        createdById: new mongoose.Types.ObjectId(createdById), createdAt: now, updatedAt: now
      })));
    }
    if (plan.updates.length) {
      await collection.bulkWrite(plan.updates.map((update) => ({
        updateOne: { filter: { _id: new mongoose.Types.ObjectId(update.assessmentId) }, update: { $set: { incidentId: new mongoose.Types.ObjectId(update.incidentId) } } }
      })));
    }
    await collection.createIndex({ incidentId: 1, status: 1 }, {
      unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'one_active_assessment_per_incident'
    });
    for (const index of indexes) {
      if (index.name === 'one_active_assessment_per_report') await collection.dropIndex(index.name);
    }
    console.log(`Migration applied: ${plan.updates.length} assessment relationship(s) updated.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Risk assessment migration failed.');
    process.exitCode = 1;
  });
}
