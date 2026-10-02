import { describe, expect, it, vi } from 'vitest';
import { RiskMapService } from '../services/riskMap.service.js';
import { assessment, incident, incidentId, officerId, repositories, addWarning } from './riskMap.fixtures.js';

function setup() {
  const repos = repositories();
  return { ...repos, service: new RiskMapService(repos.incidents, repos.assessments, repos.warnings) };
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
});
