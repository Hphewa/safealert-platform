import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { WarningModel, toSafeWarning } from '../models/warning.model.js';
import { warningInput } from './warning.fixtures.js';

function document() {
  return new WarningModel({ ...warningInput, assessmentId: new mongoose.Types.ObjectId(),
    hazardReportId: new mongoose.Types.ObjectId(), createdById: new mongoose.Types.ObjectId(),
    riskLevel: 'HIGH', createdAt: new Date(), updatedAt: new Date() });
}
describe('warning persistence', () => {
  it('defines relationships, timestamps, and draft default', async () => {
    const warning = document();
    await expect(warning.validate()).resolves.toBeUndefined();
    expect(WarningModel.schema.path('assessmentId').options.ref).toBe('RiskAssessment');
    expect(WarningModel.schema.path('hazardReportId').options.ref).toBe('Report');
    expect(WarningModel.schema.path('createdById').options.ref).toBe('User');
    expect(toSafeWarning(warning)).toMatchObject({ ...warningInput, status: 'DRAFT',
      assessmentId: warning.assessmentId.toString(), createdById: warning.createdById.toString(),
      createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(toSafeWarning(warning)).not.toHaveProperty('_id');
  });
  it.each([{ riskLevel: 'LOW' }, { riskLevel: 'MODERATE' },
    { affectedArea: '   ' }, { requiredAction: '' }, { unsafeRoads: '' }, { message: '' },
    { attachments: ['file:///photo.jpg'] }, { attachments: Array(6).fill('https://example.com/photo.jpg') }
  ])('rejects invalid persisted data %j', async (invalid) => {
    const warning = document();
    warning.set(invalid);
    await expect(warning.validate()).rejects.toThrow();
  });
});
