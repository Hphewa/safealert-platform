import { HAZARD_TYPES, RISK_LEVELS, type RiskMapIncident, type RiskMapResponse, type UserRole } from '@safealert/contracts';
import { apiRequest } from '../../../services/api/client';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Risk Map response.');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid Risk Map value.');
  return value;
}
function timestamp(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error('Invalid Risk Map timestamp.');
  return result;
}

/** Validate the response at the network boundary; never retain unexpected private fields. */
export function parseRiskMapResponse(value: unknown, role: UserRole): RiskMapResponse {
  const envelope = object(value);
  if (envelope.role !== role || !Array.isArray(envelope.incidents)) throw new Error('Invalid Risk Map role or incidents.');
  const generatedAt = timestamp(envelope.generatedAt);
  const ids = new Set<string>();
  const incidents = envelope.incidents.map((value) => {
    const item = object(value); const location = object(item.location); const coordinates = location.coordinates;
    if (location.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length !== 2 ||
      !coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) ||
      Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90 ||
      !HAZARD_TYPES.includes(item.hazardType as never) || !RISK_LEVELS.includes(item.riskLevel as never) ||
      typeof item.hasPublishedWarning !== 'boolean') throw new Error('Invalid Risk Map incident.');
    const incidentId = string(item.incidentId);
    if (ids.has(incidentId)) throw new Error('Duplicate Risk Map incident.');
    ids.add(incidentId);
    const common: RiskMapIncident = {
      incidentId, hazardType: item.hazardType as RiskMapIncident['hazardType'],
      location: { type: 'Point', coordinates: [coordinates[0], coordinates[1]] },
      riskLevel: item.riskLevel as RiskMapIncident['riskLevel'], assessedAt: timestamp(item.assessedAt),
      hasPublishedWarning: item.hasPublishedWarning
    };
    if (role === 'RESIDENT' || role === 'COMMUNITY_VOLUNTEER') return common;
    if (item.incidentStatus !== 'ACTIVE' || !Number.isInteger(item.reportCount) || (item.reportCount as number) < 0) throw new Error('Invalid Risk Map operational data.');
    const operational = { ...common, incidentStatus: 'ACTIVE' as const, reportCount: item.reportCount as number };
    if (role === 'EMERGENCY_RESPONDER') return operational;
    if (item.assessmentStatus !== 'ACTIVE' || typeof item.calculatedScore !== 'number' || !Number.isFinite(item.calculatedScore)) throw new Error('Invalid Risk Map assessment.');
    return { ...operational, assessmentId: string(item.assessmentId), assessmentStatus: 'ACTIVE' as const, calculatedScore: item.calculatedScore };
  });
  // Every branch above enforces the fields associated with this authenticated role.
  return { role, generatedAt, incidents } as RiskMapResponse;
}

export async function getRiskMap(accessToken: string, role: UserRole): Promise<RiskMapResponse> {
  return parseRiskMapResponse(await apiRequest<unknown>('/risk-map', { accessToken }), role);
}
