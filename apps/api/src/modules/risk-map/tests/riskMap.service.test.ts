import { describe, expect, it, vi } from 'vitest';
import { RiskMapService } from '../services/riskMap.service.js';
import { assessment, incident, incidentId, officerId, repositories, addWarning } from './riskMap.fixtures.js';

function setup() {
  const repos = repositories();
  return { ...repos, service: new RiskMapService(repos.incidents, repos.assessments, repos.warnings, repos.reports) };
}
describe('Risk Map current incident read model', () => {
  it('uses the final decision and stored incident point, once for four reports', async () => {
    const { assessments, service } = setup();
    const saved = await assessments.create(assessment({ finalRiskLevel: 'CRITICAL' }));
    const result = await service.list('DISASTER_OFFICER');
    expect(result.incidents).toEqual([{ incidentId, hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] },
      riskLevel: 'CRITICAL', assessedAt: saved.assessedAt, hasPublishedWarning: false,
      incidentStatus: 'ACTIVE', reportCount: 4, assessmentId: saved.id, assessmentStatus: 'ACTIVE', calculatedScore: 18 }]);
    expect(Number.isFinite(Date.parse(result.generatedAt))).toBe(true);
  });
  it.each(['none', 'CLOSED', 'VOID', 'deleted'] as const)('omits incidents with %s assessment history', async (state) => {
    const { assessments, service } = setup();
    if (state !== 'none') {
      const saved = await assessments.create(assessment({ status: state === 'deleted' ? 'CLOSED' : state }));
      if (state === 'deleted') await assessments.softDeleteClosedAssessment(saved.id, {
        deletedAt: '2026-10-01T12:00:00.000Z', deletedById: officerId, deleteReason: 'CREATED_BY_MISTAKE'
      });
    }
    expect((await service.list('RESIDENT')).incidents).toEqual([]);
  });
  it.each(['RESOLVED', 'CLOSED'] as const)('omits %s incidents even with active assessments', async (status) => {
    const { incidents, assessments, service } = setup();
    incidents.seedIncident(incident({ status }));
    await assessments.create(assessment());
    expect((await service.list('RESIDENT')).incidents).toEqual([]);
  });
  it.each([undefined, null, {}, { type: 'Point', coordinates: [] }, { type: 'Point', coordinates: [181, 7] }])(
    'omits malformed stored locations without throwing: %j', async (location) => {
      const { incidents, assessments, service } = setup();
      incidents.seedIncident({ ...incident(), location } as ReturnType<typeof incident>);
      await assessments.create(assessment());
      const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try { expect((await service.list('RESIDENT')).incidents).toEqual([]); }
      finally { diagnostic.mockRestore(); }
    }
  );
  it('shows the active assessment even when latest history is a newer VOID row', async () => {
    const { assessments, service } = setup();
    await assessments.create(assessment());
    await assessments.create(assessment({ status: 'VOID', finalRiskLevel: 'LOW', assessedAt: '2026-10-02T12:00:00.000Z' }));
    expect((await service.list('RESIDENT')).incidents.map(item => item.riskLevel)).toEqual(['HIGH']);
  });
  it('reassessment replaces severity and warning association; manual close removes the marker', async () => {
    const { incidents, assessments, warnings, service } = setup();
    const first = await assessments.create(assessment());
    await addWarning(warnings, first.id, 'PUBLISHED');
    expect((await service.list('RESIDENT')).incidents[0]).toMatchObject({ riskLevel: 'HIGH', hasPublishedWarning: true });
    const replacement = await assessments.reassess(first.id, { ...assessment({ finalRiskLevel: 'CRITICAL' }),
      assessedAt: '2026-10-01T12:00:00.000Z', reassessmentReason: 'New verified evidence received.' });
    expect((await service.list('RESIDENT')).incidents).toEqual([expect.objectContaining({ riskLevel: 'CRITICAL', hasPublishedWarning: false })]);
    await assessments.softDeleteClosedAssessment(first.id, { deletedAt: '2026-10-01T13:00:00.000Z', deletedById: officerId, deleteReason: 'INCORRECT_INFORMATION' });
    expect((await service.list('RESIDENT')).incidents[0]?.riskLevel).toBe('CRITICAL');
    await assessments.closeActiveAssessment(replacement.id, { closureReason: 'MONITORING_COMPLETED', closedAt: '2026-10-01T14:00:00.000Z', closedById: officerId });
    expect((await service.list('RESIDENT')).incidents).toEqual([]);
    expect((await incidents.findById(incidentId))?.status).toBe('ACTIVE');
  });
  it.each(['DRAFT', 'PUBLISHED'] as const)('derives publication presence from current %s warning only', async status => {
    const { assessments, warnings, service } = setup();
    const current = await assessments.create(assessment());
    await addWarning(warnings, current.id, status);
    expect((await service.list('RESIDENT')).incidents[0]?.hasPublishedWarning).toBe(status === 'PUBLISHED');
  });
  it('batches joins and returns deterministic incident order', async () => {
    const { incidents, assessments, warnings, service } = setup();
    const secondId = '000000000000000000000001';
    incidents.seedIncident(incident({ id: secondId }));
    await assessments.create(assessment());
    await assessments.create(assessment({ incidentId: secondId }));
    const lifecycle = vi.spyOn(assessments, 'findLifecycleByIncidentIds');
    const warningRead = vi.spyOn(warnings, 'findByAssessmentIds');
    const first = await service.list('RESIDENT');
    expect(first.incidents.map(item => item.incidentId)).toEqual([secondId, incidentId]);
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(warningRead).toHaveBeenCalledTimes(1);
    expect((await service.list('RESIDENT')).incidents).toEqual(first.incidents);
  });

  it('returns current role-safe factors and verified grouped images only', async () => {
    const { assessments, incidents, reports, warnings, service } = setup();
    const current = await assessments.create(assessment({ finalRiskLevel: 'CRITICAL', peopleAffected: 27, vulnerablePeople: 6 }));
    const point = { type: 'Point' as const, coordinates: [79.86, 6.92] as [number, number] };
    const image = '/api/v1/media/report-evidence/2026-10-01-123e4567-e89b-12d3-a456-426614174000.jpg';
    const base = { id: '333333333333333333333331', residentId: '444444444444444444444444', hazardType: 'FLOOD' as const,
      description: 'Private resident description', severity: 'LOW' as const, location: point, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
      status: 'VERIFIED' as const, mediaReference: image, verifiedById: officerId, verifiedAt: '2026-10-01T10:05:00.000Z' };
    reports.seedReport(base);
    reports.seedReport({ ...base, id: '333333333333333333333332' });
    reports.seedReport({ ...base, id: '333333333333333333333333', mediaReference: '/api/v1/media/report-evidence/2026-10-01-123e4567-e89b-12d3-a456-426614174000.mp4' });
    reports.seedReport({ ...base, id: '333333333333333333333334', status: 'PENDING', mediaReference: '/api/v1/media/report-evidence/2026-10-01-123e4567-e89b-12d3-a456-426614174001.png' });
    reports.seedReport({ ...base, id: '333333333333333333333335', mediaReference: 'file:///private/internal.jpg' });
    incidents.seedIncident(incident({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', reportIds: ['333333333333333333333336'] }));
    reports.seedReport({ ...base, id: '333333333333333333333336', mediaReference: '/api/v1/media/report-evidence/2026-10-01-123e4567-e89b-12d3-a456-426614174002.png' });
    await addWarning(warnings, current.id, 'PUBLISHED');
    const detail = await service.getRiskLocationDetails(incidentId, 'EMERGENCY_RESPONDER');
    expect(detail).toMatchObject({ riskLevel: 'CRITICAL', assessedAt: current.assessedAt, hasPublishedWarning: true,
      riskFactors: { peopleAffected: 27, vulnerablePeople: 6, hazardSeverity: 'HIGH' }, reportCount: 4,
      evidence: [{ type: 'IMAGE', imageUrl: image, createdAt: base.createdAt }] });
    expect(detail.evidence).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toMatch(/residentId|verifiedById|description|Private|file:\/\//);
    const volunteer = await service.getRiskLocationDetails(incidentId, 'COMMUNITY_VOLUNTEER');
    expect(volunteer.riskFactors).toMatchObject({ peopleAffected: 27, roadAccessibility: 'ACCESSIBLE' });
    expect(volunteer.riskFactors).not.toHaveProperty('vulnerablePeople');
    expect(volunteer).not.toHaveProperty('assessmentId');
    const resident = await service.getRiskLocationDetails(incidentId, 'RESIDENT');
    expect(resident.riskFactors).toEqual({ roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' });
    expect(resident).not.toHaveProperty('reportCount');
    expect(resident).not.toHaveProperty('calculatedScore');
  });

  it.each(['none', 'CLOSED', 'VOID'] as const)('does not return details for %s current assessment state', async state => {
    const { assessments, service } = setup();
    if (state !== 'none') await assessments.create(assessment({ status: state }));
    await expect(service.getRiskLocationDetails(incidentId, 'RESIDENT')).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(['RESOLVED', 'CLOSED'] as const)('does not return detail for %s incident', async status => {
    const { incidents, assessments, service } = setup();
    incidents.seedIncident(incident({ status }));
    await assessments.create(assessment());
    await expect(service.getRiskLocationDetails(incidentId, 'RESIDENT')).rejects.toMatchObject({ statusCode: 404 });
  });
});
