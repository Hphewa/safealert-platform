import type { HazardType } from '@safealert/contracts';

export type CommunityReportGroupingRule = {
  radiusMeters: number;
  timeWindowMinutes: number;
};

export const COMMUNITY_REPORT_GROUPING_RULES: Record<HazardType, CommunityReportGroupingRule> = {
  FLOOD: { radiusMeters: 500, timeWindowMinutes: 60 },
  BLOCKED_ROAD: { radiusMeters: 250, timeWindowMinutes: 60 },
  LANDSLIDE: { radiusMeters: 300, timeWindowMinutes: 90 },
  OTHER: { radiusMeters: 150, timeWindowMinutes: 45 }
};

export function getCommunityReportGroupingRule(hazardType: HazardType) {
  return COMMUNITY_REPORT_GROUPING_RULES[hazardType];
}

