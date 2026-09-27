import { describe, expect, it } from 'vitest';
import type { SafeIncident, SafeReport } from '@safealert/contracts';
import { InMemoryIncidentRepository } from '../repositories/inMemoryIncident.repository.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryRiskAssessmentRepository } from '../../risk-assessments/repositories/inMemoryRiskAssessment.repository.js';
import { InMemoryWarningRepository } from '../../warnings/repositories/inMemoryWarning.repository.js';
import type { CreateRiskAssessmentInput } from '../../risk-assessments/repositories/riskAssessment.repository.js';
import { IncidentLifecycleService } from '../services/incidentLifecycle.service.js';

const officerId = '223456789012345678901234';
function incident(id: string, status: SafeIncident['status'], reportIds: string[]): SafeIncident {
  return { id, status, reportIds, hazardType: 'FLOOD', location: { type: 'Point', coordinates: [80, 7] },
    createdById: officerId, createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T10:00:00.000Z' };
}
function report(id: string, status: SafeReport['status'], verifiedAt?: string): SafeReport {
  return { id, residentId: officerId, hazardType: 'FLOOD', description: `Report ${id}`, severity: 'HIGH',
    location: { type: 'Point', coordinates: [80, 7] }, status, createdAt: '2026-09-26T11:00:00.000Z',
    updatedAt: '2026-09-26T11:00:00.000Z', ...(verifiedAt ? { verifiedAt } : {}) };
}
function assessmentInput(incidentId: string, assessedAt: string, status: CreateRiskAssessmentInput['status'] = 'ACTIVE'):
CreateRiskAssessmentInput {
  return { incidentId, assessedById: officerId, hazardSeverity: 'HIGH', peopleAffected: 8, vulnerablePeople: 2,
    roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN',
    calculatedScore: 18, systemSuggestedRisk: 'HIGH', finalRiskLevel: 'HIGH', status, assessedAt };
}

function setup() {
  const incidents = new InMemoryIncidentRepository();
  const reports = new InMemoryReportRepository();
  const assessments = new InMemoryRiskAssessmentRepository();
  const warnings = new InMemoryWarningRepository();
  return { incidents, reports, assessments, warnings,
    service: new IncidentLifecycleService(incidents, reports, assessments, warnings) };
}

describe('IncidentLifecycleService', () => {
  it('keeps initial queue limited to active, verified, never-assessed incidents and monitors all assessed statuses', async () => {
    const { incidents, reports, assessments, warnings, service } = setup();
    const eligible = incident('123456789012345678901234', 'ACTIVE', ['r1']);
    const assessed = incident('223456789012345678901234', 'CLOSED', ['r2']);
    const deletedOnly = incident('323456789012345678901234', 'ACTIVE', ['r3']);
    const notVerified = incident('423456789012345678901234', 'ACTIVE', ['r4']);
    incidents.seedIncident(eligible); incidents.seedIncident(assessed); incidents.seedIncident(deletedOnly); incidents.seedIncident(notVerified);
    reports.seedReport(report('r1', 'VERIFIED', '2026-09-26T12:00:00.000Z'));
    reports.seedReport(report('r2', 'VERIFIED', '2026-09-26T12:00:00.000Z'));
    reports.seedReport(report('r3', 'VERIFIED', '2026-09-26T12:00:00.000Z'));
    reports.seedReport(report('r4', 'PENDING'));
    await assessments.create(assessmentInput(assessed.id, '2026-09-26T11:30:00.000Z', 'CLOSED'));
    const deleted = await assessments.create(assessmentInput(deletedOnly.id, '2026-09-26T11:30:00.000Z', 'CLOSED'));
    await warnings.create({ assessmentId: deleted.id, hazardReportId: '333333333333333333333333', createdById: officerId,
      affectedArea: 'Area', riskLevel: 'HIGH', requiredAction: 'Evacuate', unsafeRoads: 'Road A', message: 'Hidden warning', status: 'DRAFT' });
    await assessments.softDeleteClosedAssessment(deleted.id, { deletedAt: '2026-09-27T12:00:00.000Z', deletedById: officerId, deleteReason: 'DUPLICATE_RECORD' });

    const queue = await service.listInitialAssessmentQueue();
    const monitoring = await service.listMonitoring();
    expect(queue.incidents.map(({ incident: row }) => row.id)).toEqual([eligible.id]);
    expect(monitoring.incidents.map(({ incident: row }) => row.id).sort()).toEqual([assessed.id, deletedOnly.id].sort());
    expect(monitoring.incidents.find(({ incident: row }) => row.id === deletedOnly.id)).toMatchObject({
      currentAssessment: null, latestAssessment: null, totalVerifiedReports: 1, warnings: []
    });
    expect(JSON.stringify(monitoring)).not.toContain('deleteReason');
  });

  it('keeps RESOLVED and CLOSED incidents in monitoring when assessment history exists', async () => {
    const { incidents, assessments, service } = setup();
    const resolved = incident('523456789012345678901234', 'RESOLVED', []);
    const closed = incident('623456789012345678901234', 'CLOSED', []);
    incidents.seedIncident(resolved); incidents.seedIncident(closed);
    await assessments.create(assessmentInput(resolved.id, '2026-09-26T11:00:00.000Z', 'ACTIVE'));
    await assessments.create(assessmentInput(closed.id, '2026-09-26T11:00:00.000Z', 'CLOSED'));
    const result = await service.listMonitoring();
    expect(result.incidents.map(({ incident: row }) => [row.id, row.status])).toEqual([
      [closed.id, 'CLOSED'], [resolved.id, 'RESOLVED']
    ]);
  });

  it('counts only strictly newer verified evidence, projects warnings, and sorts recent evidence', async () => {
    const { incidents, reports, assessments, warnings, service } = setup();
    const row = incident('123456789012345678901234', 'ACTIVE', ['old', 'same', 'new', 'legacy', 'pending', 'rejected']);
    incidents.seedIncident(row);
    for (const [id, status, verifiedAt] of [
      ['old', 'VERIFIED', '2026-09-26T11:59:00.000Z'], ['same', 'VERIFIED', '2026-09-26T12:00:00.000Z'],
      ['new', 'VERIFIED', '2026-09-26T12:01:00.000Z'], ['legacy', 'VERIFIED', undefined], ['pending', 'PENDING', undefined],
      ['rejected', 'REJECTED', undefined]
    ] as const) reports.seedReport(report(id, status, verifiedAt));
    const active = await assessments.create(assessmentInput(row.id, '2026-09-26T12:00:00.000Z'));
    await warnings.create({ assessmentId: active.id, hazardReportId: '333333333333333333333333', createdById: officerId,
      affectedArea: 'Area', riskLevel: 'HIGH', requiredAction: 'Evacuate', unsafeRoads: 'Road A', message: 'Warning', status: 'DRAFT' });

    const result = (await service.getMonitoringDetail(row.id)).monitoring;
    expect(result).toMatchObject({ totalVerifiedReports: 4, newVerifiedReportsSinceAssessment: 1,
      latestVerifiedReportAt: '2026-09-26T12:01:00.000Z', hasNewVerifiedEvidence: true,
      warnings: [expect.objectContaining({ assessmentId: active.id, status: 'DRAFT' })] });
    const details = await service.getMonitoringDetail(row.id);
    expect(details.recentVerifiedReports.map(({ id }) => id)).toEqual(['new', 'same', 'old', 'legacy']);
  });

  it('returns 404 for missing and never-assessed incident detail', async () => {
    const { incidents, service } = setup();
    const row = incident('123456789012345678901234', 'ACTIVE', []);
    incidents.seedIncident(row);
    await expect(service.getMonitoringDetail('223456789012345678901234')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.getMonitoringDetail(row.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('uses a reassessment timestamp as the new evidence baseline without changing reports', async () => {
    const { incidents, reports, assessments, service } = setup();
    const row = incident('123456789012345678901234', 'ACTIVE', ['evidence']);
    incidents.seedIncident(row);
    const evidence = report('evidence', 'VERIFIED', '2026-09-26T12:30:00.000Z');
    reports.seedReport(evidence);
    const first = await assessments.create(assessmentInput(row.id, '2026-09-26T12:00:00.000Z'));
    expect((await service.getMonitoringDetail(row.id)).monitoring.newVerifiedReportsSinceAssessment).toBe(1);
    await assessments.reassess(first.id, { ...assessmentInput(row.id, '2026-09-26T12:45:00.000Z'), reassessmentReason: 'New rainfall changed the conditions.' });
    expect((await service.getMonitoringDetail(row.id)).monitoring.newVerifiedReportsSinceAssessment).toBe(0);
    expect(await reports.findReportById('evidence')).toEqual(evidence);
  });
});
