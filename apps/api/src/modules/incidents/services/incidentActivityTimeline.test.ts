import { describe, expect, it } from 'vitest';
import type { SafeIncident, SafeReport, SafeRiskAssessment, SafeWarning } from '@safealert/contracts';
import { buildIncidentActivityTimeline } from './incidentActivityTimeline.js';

const incident: SafeIncident = {
  id: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [80, 7] },
  reportIds: ['report-1'], status: 'ACTIVE', createdById: 'officer-1',
  createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T10:00:00.000Z'
};
const report: SafeReport = {
  id: 'report-1', residentId: 'resident-1', hazardType: 'FLOOD', severity: 'HIGH', description: 'Rising water',
  location: { type: 'Point', coordinates: [80, 7] }, status: 'VERIFIED', createdAt: '2026-09-26T10:30:00.000Z',
  updatedAt: '2026-09-26T11:00:00.000Z', verifiedAt: '2026-09-26T11:00:00.000Z',
  verificationHistory: [{ action: 'VERIFY', verifiedById: 'officer-1', verifiedAt: '2026-09-26T11:00:00.000Z' }]
};
function assessment(overrides: Partial<SafeRiskAssessment> = {}): SafeRiskAssessment {
  return {
    id: 'assessment-1', incidentId: incident.id, hazardSeverity: 'HIGH', peopleAffected: 10, vulnerablePeople: 2,
    roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING', weatherCondition: 'CLEAR',
    finalRiskLevel: 'HIGH', decisionReason: 'Observed local impacts.', calculatedScore: 18, systemSuggestedRisk: 'HIGH',
    assessedById: 'officer-1', status: 'CLOSED', isDeleted: false, assessedAt: '2026-09-26T12:00:00.000Z',
    createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T13:00:00.000Z',
    ...overrides
  };
}
function warning(overrides: Partial<SafeWarning> = {}): SafeWarning {
  return { id: 'warning-1', assessmentId: 'assessment-1', hazardReportId: 'report-1', createdById: 'officer-1',
    affectedArea: 'North bank', riskLevel: 'HIGH', requiredAction: 'Move to a safe location.', unsafeRoads: 'River road',
    message: 'Take care near the river.', status: 'PUBLISHED', publishedAt: '2026-09-26T14:00:00.000Z',
    createdAt: '2026-09-26T13:00:00.000Z', updatedAt: '2026-09-26T14:00:00.000Z', ...overrides };
}

describe('incident activity projection', () => {
  it('projects only persisted lifecycle events in newest-first order', () => {
    const result = buildIncidentActivityTimeline(incident, [report], [assessment({
      closureReason: 'INCIDENT_RESOLVED', closedAt: '2026-09-26T13:00:00.000Z'
    })], [warning()]);
    expect(result.incidentId).toBe(incident.id);
    expect(result.events.map(({ type }) => type)).toEqual([
      'WARNING_PUBLISHED', 'WARNING_CREATED', 'ASSESSMENT_CLOSED', 'ASSESSMENT_CREATED',
      'REPORT_VERIFIED', 'REPORT_CREATED', 'INCIDENT_CREATED'
    ]);
    expect(result.events[0]).toMatchObject({ timestamp: warning().publishedAt, relatedRecordId: 'warning-1' });
    expect(result.events.at(-1)).toMatchObject({ timestamp: incident.createdAt, relatedRecordId: incident.id });
  });

  it('projects reassessment as one update without duplicating its REASSESSED closure', () => {
    const previous = assessment({ id: 'assessment-old', closureReason: 'REASSESSED', closedAt: '2026-09-26T13:00:00.000Z' });
    const replacement = assessment({ id: 'assessment-new', previousAssessmentId: previous.id, status: 'ACTIVE',
      assessedAt: '2026-09-26T13:00:00.000Z',
      createdAt: '2026-09-26T13:00:00.000Z', finalRiskLevel: 'CRITICAL', calculatedScore: 27 });
    const result = buildIncidentActivityTimeline(incident, [report], [replacement, previous], []);
    expect(result.events.map(({ type }) => type).filter((type) => type.startsWith('ASSESSMENT_')))
      .toEqual(['ASSESSMENT_REASSESSED']);
    expect(result.events.find(({ type }) => type === 'ASSESSMENT_REASSESSED'))
      .toMatchObject({ relatedRecordId: 'assessment-new', description: expect.stringContaining('HIGH') });
  });

  it('uses legacy verifiedAt only when verification history is absent and never invents current-status verification', () => {
    const legacy: SafeReport = { ...report };
    delete legacy.verificationHistory;
    const rejected: SafeReport = { ...report, id: 'report-rejected', status: 'REJECTED', verificationHistory: [] };
    delete rejected.verifiedAt;
    const result = buildIncidentActivityTimeline(incident, [legacy, rejected], [], []);
    expect(result.events.filter(({ type }) => type === 'REPORT_VERIFIED')).toHaveLength(1);
    expect(result.events.filter(({ type }) => type === 'REPORT_VERIFIED')[0]?.relatedRecordId).toBe('report-1');
  });
});
