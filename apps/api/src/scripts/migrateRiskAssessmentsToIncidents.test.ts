import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { serializeAssessmentBackup, planRiskAssessmentMigration, planMissingAssessmentIncidents, type LegacyAssessmentRecord, type IncidentReference } from './migrateRiskAssessmentsToIncidents.js';

const incidents: IncidentReference[] = [
  { id: 'incident-1', reportIds: ['report-1'], status: 'ACTIVE' },
  { id: 'incident-2', reportIds: ['report-2'], status: 'RESOLVED' }
];

it('preserves BSON numeric types and precision in recovery backups', () => {
  const { Double, Long, EJSON } = mongoose.mongo.BSON;
  const restored = EJSON.parse(serializeAssessmentBackup({ score: new Double(1), count: Long.fromString('9007199254740993') }), { relaxed: false });
  expect(restored.score).toBeInstanceOf(Double);
  expect(restored.count).toBeInstanceOf(Long);
  expect(restored.count.toString()).toBe('9007199254740993');
});

describe('risk-assessment incident migration planning', () => {
  it('maps a legacy report relationship to its single incident without changing the assessment ID', () => {
    const records: LegacyAssessmentRecord[] = [{ id: 'assessment-1', hazardReportId: 'report-1', status: 'ACTIVE' }];
    expect(planRiskAssessmentMigration(records, incidents)).toEqual({
      updates: [{ assessmentId: 'assessment-1', incidentId: 'incident-1' }],
      unresolved: []
    });
  });

  it('leaves current incident relationships untouched', () => {
    const records: LegacyAssessmentRecord[] = [{ id: 'assessment-1', incidentId: 'incident-1', status: 'ACTIVE' }];
    expect(planRiskAssessmentMigration(records, incidents)).toEqual({ updates: [], unresolved: [] });
  });

  it('blocks missing and ambiguous mappings instead of guessing', () => {
    const records: LegacyAssessmentRecord[] = [
      { id: 'malformed', status: 'ACTIVE' },
      { id: 'missing', hazardReportId: 'unknown', status: 'ACTIVE' },
      { id: 'ambiguous', hazardReportId: 'report-1', status: 'ACTIVE' }
    ];
    const duplicateIncident = { id: 'incident-3', reportIds: ['report-1'], status: 'ACTIVE' };
    expect(planRiskAssessmentMigration(records, [...incidents, duplicateIncident])).toEqual({
      updates: [],
      unresolved: [
        { assessmentId: 'malformed', reason: 'MISSING_RELATIONSHIP' },
        { assessmentId: 'missing', reason: 'NO_INCIDENT_FOR_REPORT', hazardReportId: 'unknown' },
        { assessmentId: 'ambiguous', reason: 'MULTIPLE_INCIDENTS_FOR_REPORT', hazardReportId: 'report-1' }
      ]
    });
  });

  it('blocks duplicate ACTIVE assessments that would violate the incident invariant', () => {
    const records: LegacyAssessmentRecord[] = [
      { id: 'assessment-1', hazardReportId: 'report-1', status: 'ACTIVE' },
      { id: 'assessment-2', incidentId: 'incident-1', status: 'ACTIVE' }
    ];
    expect(planRiskAssessmentMigration(records, incidents)).toEqual({
      updates: [],
      unresolved: [{ assessmentId: 'assessment-1', reason: 'ACTIVE_ASSESSMENT_CONFLICT', incidentId: 'incident-1' }]
    });
  });
});

describe('recovering legacy assessments without an incident', () => {
  const assessment = { id: '123456789012345678901234', hazardReportId: '123456789012345678901235', assessedById: '123456789012345678901236', status: 'ACTIVE' };
  const report = { id: assessment.hazardReportId, status: 'VERIFIED', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] } };

  it('plans a deterministic single-report incident preserving the original assessor and evidence', () => {
    const result = planMissingAssessmentIncidents([assessment], [], [report]);
    expect(result).toEqual([{
      id: assessment.id, reportIds: [report.id], createdById: assessment.assessedById,
      status: 'ACTIVE', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] }
    }]);
    expect(planRiskAssessmentMigration([assessment], result)).toEqual({
      updates: [{ assessmentId: assessment.id, incidentId: assessment.id }], unresolved: []
    });
  });
  it('is idempotent when a previous run already created the incident', () => {
    const recovered = planMissingAssessmentIncidents([assessment], [], [report]);
    expect(planMissingAssessmentIncidents([assessment], recovered, [report])).toEqual([]);
  });
  it.each(['PENDING', 'REJECTED', 'CANCELLED'])('does not create active incidents from %s evidence', (status) => {
    expect(planMissingAssessmentIncidents([assessment], [], [{ ...report, status }])).toEqual([]);
  });
  it('does not invent missing reports, locations, or assessor identities', () => {
    expect(planMissingAssessmentIncidents([assessment], [], [])).toEqual([]);
    expect(planMissingAssessmentIncidents([assessment], [], [{ ...report, location: null }])).toEqual([]);
    expect(planMissingAssessmentIncidents([{ ...assessment, assessedById: undefined }], [], [report])).toEqual([]);
  });
  it('leaves duplicate active decisions unresolved rather than merging decisions', () => {
    const records = [assessment, { ...assessment, id: '123456789012345678901237' }];
    const recovered = planMissingAssessmentIncidents(records, [], [report]);
    expect(recovered).toHaveLength(1);
    expect(planRiskAssessmentMigration(records, recovered).unresolved).toEqual([
      { assessmentId: records[1]!.id, reason: 'ACTIVE_ASSESSMENT_CONFLICT', incidentId: assessment.id }
    ]);
  });
});
