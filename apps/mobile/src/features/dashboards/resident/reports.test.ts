import type { SafeReport } from '@safealert/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildResidentReportTimeline,
  filterResidentReports,
  formatResidentReportCount,
  formatResidentReportLocation,
  formatResidentReportSubmittedAt,
  isResidentReportEditable,
  residentReportEditHref,
  residentReportStatusHref,
  residentReportStatusSummary,
  hazardIconForResident,
  hazardLabelForResident,
  statusDescriptionForResident,
  statusLabelForResident,
  statusToneForResident
} from './reports';

const baseReport: SafeReport = {
  id: 'report-1',
  residentId: 'resident-1',
  hazardType: 'FLOOD',
  description: 'Water is rising near the lower bridge.',
  severity: 'HIGH',
  location: {
    type: 'Point',
    coordinates: [79.8612, 6.9271]
  },
  status: 'PENDING',
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z'
};

const reports: SafeReport[] = [
  { ...baseReport, id: 'pending', status: 'PENDING' },
  { ...baseReport, id: 'verified', status: 'VERIFIED' },
  { ...baseReport, id: 'rejected', status: 'REJECTED' },
  { ...baseReport, id: 'cancelled', status: 'CANCELLED' },
  { ...baseReport, id: 'resolved', status: 'RESOLVED' }
];

describe('resident report presentation helpers', () => {
  it('filters reports by the official status values used by My Reports', () => {
    expect(filterResidentReports(reports, 'all').map((report) => report.id)).toEqual([
      'pending',
      'verified',
      'rejected',
      'cancelled',
      'resolved'
    ]);
    expect(filterResidentReports(reports, 'pending').map((report) => report.id)).toEqual(['pending']);
    expect(filterResidentReports(reports, 'verified').map((report) => report.id)).toEqual(['verified']);
    expect(filterResidentReports(reports, 'rejected').map((report) => report.id)).toEqual(['rejected']);
    expect(filterResidentReports(reports, 'cancelled').map((report) => report.id)).toEqual(['cancelled']);
    expect(filterResidentReports(reports, 'resolved').map((report) => report.id)).toEqual([
      'resolved'
    ]);
  });

  it('formats report labels from backend fields', () => {
    expect(hazardLabelForResident('BLOCKED_ROAD')).toBe('Blocked Road');
    expect(hazardIconForResident('LANDSLIDE')).toBe('leaf-outline');
    expect(statusLabelForResident('PENDING')).toBe('Pending');
    expect(statusLabelForResident('CANCELLED')).toBe('Cancelled');
    expect(statusDescriptionForResident('PENDING')).toBe('Waiting for verification');
    expect(statusDescriptionForResident('CANCELLED')).toBe('Cancelled before verification');
    expect(statusToneForResident('REJECTED')).toBe('critical');
    expect(statusToneForResident('CANCELLED')).toBe('neutral');
    expect(formatResidentReportLocation(baseReport)).toBe('6.9271, 79.8612');
  });

  it('formats submitted timestamps and filter summaries', () => {
    expect(formatResidentReportSubmittedAt('not-a-date')).toBe('Submitted time unavailable');
    expect(formatResidentReportSubmittedAt('2026-08-24T09:00:00.000Z')).toContain('Submitted');
    expect(formatResidentReportCount(1, 'pending')).toBe('1 pending report');
    expect(formatResidentReportCount(1, 'verified')).toBe('1 verified report');
    expect(formatResidentReportCount(1, 'rejected')).toBe('1 rejected report');
    expect(formatResidentReportCount(1, 'cancelled')).toBe('1 cancelled report');
    expect(formatResidentReportCount(2, 'all')).toBe('2 submitted reports');
    expect(formatResidentReportCount(0, 'resolved')).toBe('0 resolved reports');
  });
  it('builds a pending timeline from persisted report data', () => {
    expect(residentReportStatusSummary(baseReport)).toBe('Waiting for verification');
    expect(buildResidentReportTimeline(baseReport).map((item) => [item.title, item.tone])).toEqual([
      ['Report Submitted', 'success'],
      ['Waiting for Official Verification', 'pending']
    ]);
  });

  it('builds a verified timeline using verification history and timestamp', () => {
    const verified: SafeReport = {
      ...baseReport,
      status: 'VERIFIED',
      verifiedById: 'officer-1',
      verifiedAt: '2026-08-24T10:00:00.000Z',
      verificationHistory: [
        {
          action: 'VERIFY',
          verifiedById: 'officer-1',
          verifiedAt: '2026-08-24T10:00:00.000Z'
        }
      ]
    };

    expect(residentReportStatusSummary(verified)).toContain('Verified');
    expect(buildResidentReportTimeline(verified).map((item) => item.title)).toEqual([
      'Report Submitted',
      'Officially Verified'
    ]);
  });

  it('builds a rejected timeline and keeps the rejection reason prominent', () => {
    const rejected: SafeReport = {
      ...baseReport,
      status: 'REJECTED',
      rejectedById: 'officer-1',
      rejectedAt: '2026-08-24T10:00:00.000Z',
      rejectionReason: 'The submitted evidence shows a different location.',
      verificationHistory: [
        {
          action: 'REJECT',
          rejectedById: 'officer-1',
          rejectedAt: '2026-08-24T10:00:00.000Z',
          rejectionReason: 'The submitted evidence shows a different location.'
        }
      ]
    };

    const timeline = buildResidentReportTimeline(rejected);

    expect(residentReportStatusSummary(rejected)).toBe('The submitted evidence shows a different location.');
    expect(timeline.map((item) => [item.title, item.tone])).toEqual([
      ['Report Submitted', 'success'],
      ['Report Rejected', 'critical']
    ]);
    expect(timeline[1]?.detail).toContain('The submitted evidence shows a different location.');
  });

  it('builds a resolved timeline after verification when available', () => {
    const resolved: SafeReport = {
      ...baseReport,
      status: 'RESOLVED',
      verifiedAt: '2026-08-24T10:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z'
    };

    expect(buildResidentReportTimeline(resolved).map((item) => item.title)).toEqual([
      'Report Submitted',
      'Officially Verified',
      'Resolved'
    ]);
  });

  it('builds a cancelled timeline and marks only pending reports editable', () => {
    const cancelled: SafeReport = {
      ...baseReport,
      status: 'CANCELLED',
      cancelledById: 'resident-1',
      cancelledAt: '2026-08-24T09:30:00.000Z'
    };

    expect(residentReportStatusSummary(cancelled)).toContain('Cancelled');
    expect(buildResidentReportTimeline(cancelled).map((item) => [item.title, item.tone])).toEqual([
      ['Report Submitted', 'success'],
      ['Report Cancelled', 'neutral']
    ]);
    expect(isResidentReportEditable(baseReport)).toBe(true);
    expect(isResidentReportEditable(cancelled)).toBe(false);
  });

  it('builds report-status navigation params from a backend report id', () => {
    expect(residentReportStatusHref('report/one')).toEqual({
      pathname: '/resident/report-status',
      params: { reportId: 'report/one' }
    });
    expect(residentReportEditHref('report/one')).toEqual({
      pathname: '/resident/report-edit',
      params: { reportId: 'report/one' }
    });
  });
});
