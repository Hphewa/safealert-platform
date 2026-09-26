import {
  INCIDENT_MATCH_RADIUS_METERS,
  INCIDENT_MATCH_TIME_WINDOW_HOURS,
  type CreateIncidentRequest,
  type IncidentCandidatesResponse,
  type GetActiveIncidentsResponse,
  type IncidentWithReportsResponse,
  type IncidentResponse
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { ReportRepository } from '../../reports/repositories/report.repository.js';
import { ActiveIncidentExistsError, type IncidentRepository } from '../repositories/incident.repository.js';

export class IncidentService {
  constructor(private readonly incidents: IncidentRepository, private readonly reports: ReportRepository) {}

  async create(officerId: string, input: CreateIncidentRequest): Promise<IncidentResponse> {
    const reports = await Promise.all(input.reportIds.map(async (reportId) => {
      const report = await this.reports.findReportById(reportId);
      if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
      if (report.status !== 'VERIFIED') {
        throw new ApiError(409, 'INVALID_REPORT_STATE', 'Only verified reports can belong to an incident.');
      }
      return report;
    }));
    const firstReport = reports[0];
    if (!firstReport) throw new ApiError(400, 'VALIDATION_ERROR', 'An incident must contain at least one report.');
    if (reports.some((report) => report.hazardType !== firstReport.hazardType)) {
      throw new ApiError(409, 'INCIDENT_HAZARD_MISMATCH', 'All incident reports must have the same hazard type.');
    }

    const conflict = () => new ApiError(409, 'ACTIVE_INCIDENT_EXISTS', 'One or more reports already belong to an active incident.');
    if (await this.incidents.findActiveByReportIds(input.reportIds)) throw conflict();

    try {
      // The reports remain source evidence. Only their IDs and a representative point are stored.
      const incident = await this.incidents.create({
        hazardType: firstReport.hazardType,
        location: { type: 'Point', coordinates: [...firstReport.location.coordinates] },
        reportIds: reports.map((report) => report.id), status: 'ACTIVE', createdById: officerId
      });
      return { incident };
    } catch (error) {
      // A competing officer can win after the friendly precheck; the DB index is authoritative.
      if (error instanceof ActiveIncidentExistsError) throw conflict();
      throw error;
    }
  }

  async getById(incidentId: string): Promise<IncidentResponse> {
    const incident = await this.incidents.findById(incidentId);
    if (!incident) throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
    return { incident };
  }

  async getDetails(incidentId: string): Promise<IncidentWithReportsResponse> {
    const incident = await this.incidents.findById(incidentId);
    if (!incident) throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
    const reports = await this.reports.findReportsByIds(incident.reportIds);
    const reportsById = new Map(reports.map((report) => [report.id, report]));
    return {
      incident,
      // Preserve the incident's membership order so the response remains easy to reconcile with reportIds.
      reports: incident.reportIds.flatMap((reportId) => {
        const report = reportsById.get(reportId);
        return report ? [report] : [];
      })
    };
  }

  async listActive(): Promise<GetActiveIncidentsResponse> {
    const incidents = await this.incidents.findActive();
    return {
      incidents: await Promise.all(incidents.map((incident) => this.getDetails(incident.id)))
    };
  }

  async addReport(incidentId: string, reportId: string): Promise<IncidentResponse> {
    const report = await this.reports.findReportById(reportId);
    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
    if (report.status !== 'VERIFIED') {
      throw new ApiError(409, 'INVALID_REPORT_STATE', 'Only verified reports can belong to an incident.');
    }

    const incident = await this.incidents.findById(incidentId);
    if (!incident) throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
    if (incident.status !== 'ACTIVE') {
      throw new ApiError(409, 'INCIDENT_NOT_ACTIVE', 'Reports can only be added to active incidents.');
    }
    if (incident.hazardType !== report.hazardType) {
      throw new ApiError(409, 'INCIDENT_HAZARD_MISMATCH', 'The report hazard type does not match the incident.');
    }
    if (incident.reportIds.includes(report.id)) {
      throw new ApiError(409, 'REPORT_ALREADY_IN_INCIDENT', 'The report is already part of this incident.');
    }

    const activeOwner = await this.incidents.findActiveByReportIds([report.id]);
    if (activeOwner && activeOwner.id !== incident.id) {
      throw new ApiError(409, 'ACTIVE_INCIDENT_EXISTS', 'The report already belongs to another active incident.');
    }

    try {
      const updated = await this.incidents.addReportToActiveIncident(incident.id, report.id);
      if (!updated) throw new ApiError(409, 'INCIDENT_NOT_ACTIVE', 'Reports can only be added to active incidents.');
      return { incident: updated };
    } catch (error) {
      // A concurrent officer can claim the report after the friendly ownership check.
      if (error instanceof ActiveIncidentExistsError) {
        throw new ApiError(409, 'ACTIVE_INCIDENT_EXISTS', 'The report already belongs to another active incident.');
      }
      throw error;
    }
  }

  async findCandidates(reportId: string): Promise<IncidentCandidatesResponse> {
    const selectedReport = await this.reports.findReportById(reportId);
    if (!selectedReport) throw new ApiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
    if (selectedReport.status !== 'VERIFIED') {
      throw new ApiError(409, 'INVALID_REPORT_STATE', 'Only verified reports can be used for incident matching.');
    }

    const possible = await this.incidents.findActiveCandidates({
      hazardType: selectedReport.hazardType,
      location: selectedReport.location,
      radiusMeters: INCIDENT_MATCH_RADIUS_METERS
    });
    const selectedTime = Date.parse(selectedReport.createdAt);
    const timeWindowMs = INCIDENT_MATCH_TIME_WINDOW_HOURS * 60 * 60 * 1000;
    const candidates: Array<{
      candidate: IncidentCandidatesResponse['candidates'][number];
      timeDistanceMs: number;
    }> = [];

    for (const possibleCandidate of possible) {
      // An already-owned report is evidence for its current incident, not a new candidate.
      if (possibleCandidate.incident.reportIds.includes(selectedReport.id)) continue;
      const memberReports = await this.reports.findReportsByIds(possibleCandidate.incident.reportIds);
      const memberTimes = memberReports
        .map((report) => Date.parse(report.createdAt))
        .filter((timestamp) => Number.isFinite(timestamp));
      if (!memberTimes.length) continue;
      const timeDistanceMs = Math.min(...memberTimes.map((timestamp) => Math.abs(timestamp - selectedTime)));
      if (!Number.isFinite(selectedTime) || timeDistanceMs > timeWindowMs) continue;
      const earliestReportAt = new Date(Math.min(...memberTimes)).toISOString();
      const latestReportAt = new Date(Math.max(...memberTimes)).toISOString();
      candidates.push({
        timeDistanceMs,
        candidate: {
          incidentId: possibleCandidate.incident.id,
          hazardType: possibleCandidate.incident.hazardType,
          location: possibleCandidate.incident.location,
          reportCount: possibleCandidate.incident.reportIds.length,
          earliestReportAt,
          latestReportAt,
          distanceMeters: Number(possibleCandidate.distanceMeters.toFixed(2))
        }
      });
    }

    candidates.sort((left, right) =>
      left.candidate.distanceMeters - right.candidate.distanceMeters ||
      left.timeDistanceMs - right.timeDistanceMs ||
      left.candidate.incidentId.localeCompare(right.candidate.incidentId)
    );
    return { candidates: candidates.map(({ candidate }) => candidate) };
  }

  /**
   * Groups a newly verified report without asking the client to choose an incident.
   * The existing candidate heuristic remains the source of truth; the nearest and
   * temporally strongest candidate is already sorted first by findCandidates().
   */
  async automaticallyGroupVerifiedReport(reportId: string, officerId: string) {
    const report = await this.reports.findReportById(reportId);
    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
    if (report.status !== 'VERIFIED') {
      throw new ApiError(409, 'INVALID_REPORT_STATE', 'Only verified reports can be grouped automatically.');
    }

    // This makes retries after a lost response safe and avoids duplicate ownership.
    const existing = await this.incidents.findActiveByReportIds([report.id]);
    if (existing) return { action: 'ALREADY_ASSIGNED' as const, incident: existing };

    const { candidates } = await this.findCandidates(report.id);
    const candidate = candidates[0];
    if (!candidate) {
      try {
        const created = await this.create(officerId, { reportIds: [report.id] });
        return { action: 'CREATED' as const, incident: created.incident };
      } catch (error) {
        // A concurrent verifier may have created the owner after our precheck.
        if (error instanceof ActiveIncidentExistsError) {
          const owner = await this.incidents.findActiveByReportIds([report.id]);
          if (owner) return { action: 'ALREADY_ASSIGNED' as const, incident: owner };
        }
        throw error;
      }
    }

    try {
      const attached = await this.addReport(candidate.incidentId, report.id);
      return { action: 'ATTACHED' as const, incident: attached.incident, candidate };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ACTIVE_INCIDENT_EXISTS') {
        const owner = await this.incidents.findActiveByReportIds([report.id]);
        if (owner) return { action: 'ALREADY_ASSIGNED' as const, incident: owner };
      }
      throw error;
    }
  }
}
