import {
  HAZARD_ASSESSMENT_SEVERITIES, HAZARD_TYPES, INFRASTRUCTURE_IMPACT_LEVELS,
  ROAD_ACCESSIBILITY_OPTIONS, RISK_LEVELS, WATER_LEVEL_TRENDS, WEATHER_CONDITIONS,
  type RiskLocationDetailsResponse, type UserRole
} from '@safealert/contracts';
import { apiRequest } from '../../../services/api/client';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid risk location details.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid risk location details.');
  return value;
}
function time(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error('Invalid risk location details time.');
  return result;
}
function member<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== 'string' || !options.includes(value as T)) throw new Error('Invalid risk factor.');
  return value as T;
}
function safeImageUrl(value: unknown): string {
  const result = text(value);
  if (!/^\/(?:[a-z\d_-]+\/)*report-evidence\/\d{4}-\d{2}-\d{2}-[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}\.(?:jpe?g|png)$/i.test(result)) {
    throw new Error('Invalid evidence image URL.');
  }
  return result;
}

/** Parse into a new role allowlist; ignore fields the authenticated role must not see. */
export function parseRiskLocationDetailsResponse(value: unknown, role: UserRole): RiskLocationDetailsResponse {
  const envelope = record(value);
  const detail = record(envelope.detail);
  if (envelope.role !== role || !Array.isArray(detail.evidence) || typeof detail.hasPublishedWarning !== 'boolean') {
    throw new Error('Invalid risk location detail role or shape.');
  }
  const location = record(detail.location);
  const coordinates = location.coordinates;
  if (location.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length !== 2 ||
    !coordinates.every(point => typeof point === 'number' && Number.isFinite(point)) ||
    Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) throw new Error('Invalid risk location coordinates.');
  const hazardType = member(detail.hazardType, HAZARD_TYPES);
  const riskLevel = member(detail.riskLevel, RISK_LEVELS);
  const incidentId = text(detail.incidentId);
  if (!/^[a-f\d]{24}$/i.test(incidentId)) throw new Error('Invalid incident id.');
  const riskFactors = record(detail.riskFactors);
  const common = {
    incidentId, hazardType, location: { type: 'Point' as const, coordinates: [coordinates[0], coordinates[1]] as [number, number] },
    riskLevel, assessedAt: time(detail.assessedAt), hasPublishedWarning: detail.hasPublishedWarning,
    evidence: detail.evidence.map(value => {
      const item = record(value); const imageUrl = safeImageUrl(item.imageUrl);
      if (item.type !== 'IMAGE') throw new Error('Invalid evidence image.');
      return { type: 'IMAGE' as const, imageUrl, createdAt: time(item.createdAt) };
    })
  };
  if (new Set(common.evidence.map(item => item.imageUrl)).size !== common.evidence.length) throw new Error('Duplicate evidence image.');
  const baseFactors = {
    roadAccessibility: member(riskFactors.roadAccessibility, ROAD_ACCESSIBILITY_OPTIONS),
    infrastructureImpact: member(riskFactors.infrastructureImpact, INFRASTRUCTURE_IMPACT_LEVELS),
    waterLevelTrend: member(riskFactors.waterLevelTrend, WATER_LEVEL_TRENDS),
    weatherCondition: member(riskFactors.weatherCondition, WEATHER_CONDITIONS)
  };
  const generatedAt = time(envelope.generatedAt);
  if (role === 'RESIDENT') return { role, generatedAt, detail: { ...common, riskFactors: baseFactors } };
  const factors = {
    hazardSeverity: member(riskFactors.hazardSeverity, HAZARD_ASSESSMENT_SEVERITIES),
    peopleAffected: riskFactors.peopleAffected,
    ...baseFactors
  };
  if (!Number.isSafeInteger(factors.peopleAffected) || (factors.peopleAffected as number) < 0) throw new Error('Invalid affected-people count.');
  if (role === 'COMMUNITY_VOLUNTEER') return { role, generatedAt,
    detail: { ...common, riskFactors: { ...factors, peopleAffected: factors.peopleAffected as number } } };
  if (detail.incidentStatus !== 'ACTIVE' || !Number.isSafeInteger(detail.reportCount) || (detail.reportCount as number) < 0) throw new Error('Invalid responder detail.');
  const responderFactors = { ...factors, peopleAffected: factors.peopleAffected as number,
    vulnerablePeople: riskFactors.vulnerablePeople };
  if (!Number.isSafeInteger(responderFactors.vulnerablePeople) || (responderFactors.vulnerablePeople as number) < 0) throw new Error('Invalid vulnerable-people count.');
  const responder = { ...common, incidentStatus: 'ACTIVE' as const, reportCount: detail.reportCount as number,
    riskFactors: { ...responderFactors, vulnerablePeople: responderFactors.vulnerablePeople as number } };
  if (role === 'EMERGENCY_RESPONDER') return { role, generatedAt, detail: responder };
  if (typeof detail.calculatedScore !== 'number' || !Number.isFinite(detail.calculatedScore) || detail.calculatedScore < 0) throw new Error('Invalid officer detail.');
  return { role, generatedAt, detail: { ...responder, assessmentId: text(detail.assessmentId), calculatedScore: detail.calculatedScore } };
}

export async function getRiskLocationDetails(incidentId: string, accessToken: string, role: UserRole) {
  return parseRiskLocationDetailsResponse(await apiRequest<unknown>(`/risk-map/${encodeURIComponent(incidentId)}`, { accessToken }), role);
}
