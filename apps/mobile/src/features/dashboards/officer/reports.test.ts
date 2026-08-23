import { describe, expect, it } from 'vitest';

import { filterOfficerGroupedReports, type OfficerGroupedReportSummary } from './reports';

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

describe('filterOfficerGroupedReports', () => {
  it('matches a report by search text and hazard filter', () => {
    const results = filterOfficerGroupedReports(sampleReports, 'kelani', 'FLOOD');

    expect(results.map((report) => report.id)).toEqual(['kelani-river-side']);
  });
});
