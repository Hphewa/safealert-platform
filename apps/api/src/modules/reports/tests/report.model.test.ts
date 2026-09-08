import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { ReportModel, toSafeReport } from '../models/report.model.js';

const residentId = new mongoose.Types.ObjectId();
const officerId = new mongoose.Types.ObjectId();
const reportedAt = new Date('2026-08-23T13:00:00.000Z');

function createReportDocument(verificationHistory: Record<string, unknown>[]) {
  return new ReportModel({
    residentId,
    hazardType: 'BLOCKED_ROAD',
    description: 'The road is reported as blocked near the railway crossing.',
    severity: 'HIGH',
    location: {
      type: 'Point',
      coordinates: [79.8612, 6.9271]
    },
    mediaReference: 'media/reports/road-evidence.jpg',
    status: 'PENDING',
    verificationHistory,
    createdAt: reportedAt,
    updatedAt: reportedAt
  });
}

describe('Report model review audit', () => {
  it.each([
    { action: 'VERIFY' },
    { action: 'REJECT' },
    {
      action: 'REJECT',
      rejectedById: officerId,
      rejectedAt: reportedAt
    }
  ])('rejects an incomplete $action history event', async (historyEvent) => {
    const report = createReportDocument([historyEvent]);

    await expect(report.validate()).rejects.toThrow();
  });

  it('serializes complete rejection audit data without removing resident evidence', async () => {
    const rejectedAt = new Date('2026-08-23T13:30:00.000Z');
    const rejectionReason = 'The submitted photo shows an unrelated location.';
    const report = createReportDocument([
      {
        action: 'REJECT',
        rejectedById: officerId,
        rejectedAt,
        rejectionReason
      }
    ]);
    report.status = 'REJECTED';
    report.rejection = {
      rejectedById: officerId,
      rejectedAt,
      rejectionReason
    };
    report.updatedAt = rejectedAt;

    await expect(report.validate()).resolves.toBeUndefined();

    expect(toSafeReport(report)).toEqual(
      expect.objectContaining({
        residentId: residentId.toString(),
        description: 'The road is reported as blocked near the railway crossing.',
        mediaReference: 'media/reports/road-evidence.jpg',
        status: 'REJECTED',
        rejectedById: officerId.toString(),
        rejectedAt: rejectedAt.toISOString(),
        rejectionReason,
        verificationHistory: [
          {
            action: 'REJECT',
            rejectedById: officerId.toString(),
            rejectedAt: rejectedAt.toISOString(),
            rejectionReason
          }
        ]
      })
    );
  });
});
