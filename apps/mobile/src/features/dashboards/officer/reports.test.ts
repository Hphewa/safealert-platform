import { describe, expect, it, vi } from 'vitest';
import type { SafeReport } from '@safealert/contracts';

vi.mock('@/services/api/client', () => ({
  apiBaseUrl: 'http://localhost:4000/api/v1'
}));

import {
  filterOfficerGroupedReports,
  mapSafeReportToOfficerGroupedReportSummary,
  mapSafeReportToOfficerReviewRecord,
  validateOfficerRejectionReason,
  type OfficerGroupedReportSummary
} from './reports';

const sampleReports: OfficerGroupedReportSummary[] = [
  {
    id: 'kelani-river-side',
    hazardType: 'FLOOD',
    hazardLabel: 'Flood',
    severity: 'HIGH',
    status: 'PENDING',
    statusLabel: 'Pending Review',
    locationLabel: 'Kelani River Side, Colombo 06',
    latestUpdateLabel: '1h ago',
    communityReportsCount: 12,
    communityReportsLabel: '12 Community Reports',
    descriptionPreview: 'Flood water is spreading along the river edge and reaching the road shoulder.',
    searchText: 'kelani river side flood water road shoulder',
    tone: 'info',
    icon: 'water-outline',
    href: '/officer/reports/kelani-river-side'
  },
  {
    id: 'temple-approach-road',
    hazardType: 'BLOCKED_ROAD',
    hazardLabel: 'Blocked Road',
    severity: 'MODERATE',
    status: 'PENDING',
    statusLabel: 'Pending Review',
    locationLabel: 'Temple Approach Road, Kandy',
    latestUpdateLabel: '32m ago',
    communityReportsCount: 8,
    communityReportsLabel: '8 Community Reports',
    descriptionPreview: 'A slope failure has narrowed the road and left loose debris along the edge.',
    searchText: 'temple approach road slope failure debris',
    tone: 'moderate',
    icon: 'trail-sign-outline',
    href: '/officer/reports/temple-approach-road'
  }
];

const safePendingReport: SafeReport = {
  id: 'real-pending-report',
  residentId: 'resident-123',
  hazardType: 'FLOOD',
  description: 'Flood water is crossing the access road near the bridge.',
  severity: 'HIGH',
  location: {
    type: 'Point',
    coordinates: [79.8612, 6.9271]
  },
  mediaReference: 'https://example.com/flood-evidence.jpg',
  status: 'PENDING',
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:30:00.000Z'
};

describe('filterOfficerGroupedReports', () => {
  it('matches a report by search text and hazard filter', () => {
    const results = filterOfficerGroupedReports(sampleReports, 'kelani', 'FLOOD');

    expect(results.map((report) => report.id)).toEqual(['kelani-river-side']);
  });
});

describe('real Officer report mapping', () => {
  it('maps a pending API report into searchable list information', () => {
    const summary = mapSafeReportToOfficerGroupedReportSummary(
      safePendingReport,
      new Date('2026-08-24T10:00:00.000Z')
    );

    expect(summary).toEqual(
      expect.objectContaining({
        id: 'real-pending-report',
        locationLabel: '6.927100, 79.861200',
        latestUpdateLabel: '30m ago',
        communityReportsCount: 1,
        communityReportsLabel: '1 Community Report',
        href: '/officer/reports/real-pending-report'
      })
    );
    expect(summary.searchText).toContain('flood water is crossing the access road');
  });

  it('maps real resident evidence and does not invent volunteer evidence', () => {
    const report = mapSafeReportToOfficerReviewRecord(
      safePendingReport,
      new Date('2026-08-24T10:00:00.000Z')
    );

    expect(report).toEqual(
      expect.objectContaining({
        residentDescription: 'Flood water is crossing the access road near the bridge.',
        residentPhotoUrl: 'https://example.com/flood-evidence.jpg',
        locationDetails: 'Coordinates: 6.927100, 79.861200',
        volunteerEvidence: [],
        checklist: {
          locationConfirmed: false,
          timeValid: false,
          multipleReports: false,
          photoEvidence: true,
          fieldUpdate: false
        }
      })
    );
    expect(report.timeline.map((event) => event.title)).toEqual(['Report submitted', 'Photo added']);
  });

  it('resolves API-relative resident photo evidence for officer preview', () => {
    const report = mapSafeReportToOfficerReviewRecord(
      {
        ...safePendingReport,
        mediaReference: '/api/v1/media/report-evidence/resident-photo.jpg'
      },
      new Date('2026-08-24T10:00:00.000Z')
    );

    expect(report.residentPhotoUrl).toBe('http://localhost:4000/api/v1/media/report-evidence/resident-photo.jpg');
    expect(report.residentMediaReference).toBe('/api/v1/media/report-evidence/resident-photo.jpg');
  });
});

describe('validateOfficerRejectionReason', () => {
  it.each(['', '   '])('requires a meaningful reason for %j', (reason) => {
    expect(validateOfficerRejectionReason(reason)).toEqual({
      isValid: false,
      normalizedReason: '',
      errorMessage: 'Enter a reason for rejecting this report.'
    });
  });

  it('requires at least 10 trimmed characters', () => {
    expect(validateOfficerRejectionReason('  Too short  ')).toEqual({
      isValid: false,
      normalizedReason: 'Too short',
      errorMessage: 'Enter at least 10 characters.'
    });
  });

  it('rejects more than 500 trimmed characters', () => {
    expect(validateOfficerRejectionReason(` ${'a'.repeat(501)} `)).toEqual({
      isValid: false,
      normalizedReason: 'a'.repeat(501),
      errorMessage: 'Keep the reason to 500 characters or fewer.'
    });
  });

  it('normalizes a valid reason for submission', () => {
    expect(validateOfficerRejectionReason('  Evidence does not match the reported location.  ')).toEqual({
      isValid: true,
      normalizedReason: 'Evidence does not match the reported location.',
      errorMessage: null
    });
  });

  it.each([
    ['minimum', ` ${'a'.repeat(10)} `, 'a'.repeat(10)],
    ['maximum', ` ${'a'.repeat(500)} `, 'a'.repeat(500)]
  ])('accepts the %s trimmed boundary', (_boundary, reason, normalizedReason) => {
    expect(validateOfficerRejectionReason(reason)).toEqual({
      isValid: true,
      normalizedReason,
      errorMessage: null
    });
  });
});
