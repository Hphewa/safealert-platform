# Phase 5: Risk Assessment Monitoring Workflow

## Goal

Separate initial assessment from ongoing monitoring for Disaster Officers. The Assessments tab contains eligible incidents that have never entered the risk-assessment lifecycle. The Monitoring tab contains incidents that have entered that lifecycle, including when their latest visible assessment is CLOSED or their assessment history has been soft-deleted.

Monitoring is a read and decision-support workflow. It does not move or duplicate records, change incident or assessment state, recalculate risk, create warnings automatically, or alter report verification.

## Current Architecture

- The API is a TypeScript/Express application organized by domain modules. Shared mobile/API response types live in `@safealert/contracts`.
- Incident routes already authenticate users and require the `DISASTER_OFFICER` role. The incident repository has an ACTIVE-only query; the incident service currently loads report details per incident for its active list.
- Risk assessments are stored in their own collection. The repository enforces one ACTIVE assessment per incident with the existing partial unique index. Reassessment atomically closes the old assessment and creates a successor with `previousAssessmentId`.
- Phase 4 adds `isDeleted` and deletion audit fields. Normal assessment reads filter deleted records, while missing `isDeleted` remains visible for legacy documents.
- Reports carry `status` and an authoritative `verifiedAt` timestamp. Incidents reference source reports by ID.
- Warnings reference a risk assessment by ID and have `DRAFT` or `PUBLISHED` status.
- The officer Monitoring nav item currently leads to a placeholder. The Assessments screen currently loads the ACTIVE incident list and performs per-incident active-assessment/history requests. The existing result screen exposes history, close, reassess, warning, and historical soft-delete behavior.
- The current branch is `feature/LDFEW-129-group-verified-reports`, and the working tree was clean during design inspection.

## Architecture

Add a focused `IncidentLifecycleService` under the incidents module. It composes incident, report, risk-assessment, and warning repository reads. It does not replace `IncidentService` or move persistence across modules.

Add officer-only endpoints under the existing `/api/v1/incidents` router:

- `GET /assessment-queue` returns ACTIVE incidents with at least one VERIFIED report and no risk-assessment document ever created.
- `GET /monitoring` returns summaries for incidents that have entered the assessment lifecycle, across incident statuses.
- `GET /monitoring/:incidentId` returns one incident's monitoring summary and recent verified reports; an unknown incident returns 404.

All routes reuse the router's authentication and `DISASTER_OFFICER` authorization middleware.

## Lifecycle Classification

The assessment queue must not equate “no ACTIVE assessment” with “never assessed.” It excludes any incident that has ever had an assessment document, including CLOSED, VOID, reassessed predecessors, and soft-deleted documents. A concise code comment will explain why the lifecycle-existence query includes soft-deleted records.

Monitoring includes every incident with assessment history, even if no assessment detail remains visible. Assessment data displayed in monitoring must always come from non-deleted records. If every assessment has been soft-deleted, the incident remains in Monitoring with no current/latest assessment details and a neutral “No active risk assessment” state. Soft-delete audit metadata is never included in monitoring responses.

For each incident, the current assessment is its non-deleted ACTIVE assessment when one exists. Otherwise, the latest non-deleted assessment by `assessedAt` is supplied as the latest assessment summary. A manually CLOSED assessment therefore stays visible as history and does not send the incident back to the initial queue.

## Shared Response Contracts

The exact shared contract shapes are:

```ts
type InitialAssessmentQueueResponse = {
  incidents: IncidentWithReportsResponse[];
};

type MonitoringAssessmentSummary = Pick<SafeRiskAssessment,
  'id' | 'finalRiskLevel' | 'calculatedScore' | 'status' |
  'assessedAt' | 'closureReason' | 'closedAt'
>;

type MonitoringReportSummary = Pick<SafeReport,
  'id' | 'description' | 'severity' | 'verifiedAt'
>;

type MonitoringWarningSummary = Pick<SafeWarning,
  'id' | 'assessmentId' | 'status' | 'createdAt' | 'publishedAt'
>;

type IncidentMonitoringSummary = {
  incident: SafeIncident;
  currentAssessment: MonitoringAssessmentSummary | null;
  latestAssessment: MonitoringAssessmentSummary | null;
  totalVerifiedReports: number;
  newVerifiedReportsSinceAssessment: number;
  latestVerifiedReportAt: string | null;
  hasNewVerifiedEvidence: boolean;
  warnings: MonitoringWarningSummary[];
};

type IncidentMonitoringListResponse = {
  incidents: IncidentMonitoringSummary[];
};

type IncidentMonitoringDetailResponse = {
  monitoring: IncidentMonitoringSummary;
  recentVerifiedReports: MonitoringReportSummary[];
};
```

The assessment queue reuses the existing incident-with-reports contract. Monitoring uses explicit summary projections so deleted audit data and unrelated report/warning fields are not exposed. Recent verified reports are capped at five, newest verification first.

## Evidence and Warning Rules

- `totalVerifiedReports` counts only VERIFIED reports belonging to the incident.
- New evidence is a verified report whose `verifiedAt` is strictly later than the current ACTIVE assessment's `assessedAt`.
- If there is no current ACTIVE assessment, the new-evidence count is zero and `hasNewVerifiedEvidence` is false.
- Reassessment naturally resets the baseline because the replacement ACTIVE assessment has a new `assessedAt`; no counter is stored.
- Pending, rejected, cancelled, and unrelated reports do not count as new verified evidence.
- New evidence never changes the official risk level. Only the existing officer reassessment flow can change it.
- Warning summaries are included only for visible current/latest assessments. The summary preserves warning ID and status so existing warning screens can be reused.

## Repository and Query Design

Repository interfaces gain batched methods needed by the lifecycle service:

- list incidents across statuses for Monitoring while retaining the current ACTIVE-only query for the initial queue;
- determine which requested incident IDs have any assessment document, including soft-deleted documents;
- retrieve current ACTIVE and latest visible assessment summaries for a set of incident IDs without returning deleted assessments;
- retrieve monitoring-relevant reports for a set of report IDs in one call;
- retrieve warning summaries for a set of visible assessment IDs in one call.

Mongoose and in-memory repositories implement equivalent behavior. The service performs one batch per data source rather than one API/repository call per incident. Queries project only fields required by the service. No polling, caching, or real-time infrastructure is introduced.

## Officer UI and Navigation

### Assessments

The Assessments tab consumes `GET /assessment-queue` and displays only initial-assessment candidates. It keeps the existing `CreateRiskAssessmentScreen` flow. Its empty state reads “No incidents currently require an initial risk assessment.” It does not offer view, reassess, close, or delete actions for already-assessed incidents.

After an initial assessment saves, the form route is replaced with that incident's Monitoring detail route. The detail screen displays: “Risk assessment saved successfully. This incident is now available in Monitoring.” The incident is absent from the initial queue after refresh.

### Monitoring List and Detail

Replace the current Monitoring placeholder with a list and detail screen using existing SafeAlert dashboard components and styles.

The list shows hazard, location, incident status, current risk/status or latest closed risk/status, verified report count, new evidence count/indicator, latest verified evidence time, and a “View Monitoring” action. Its empty state reads “No assessed incidents are currently available for monitoring.”

The detail shows incident summary, current or latest visible assessment, evidence activity, recent verified reports, and warning status. If no assessment remains visible, it uses a neutral no-active-assessment state rather than “Not assessed.”

Actions reuse existing flows:

- View assessment/history opens the existing result screen.
- Reassess opens the existing `CreateRiskAssessmentScreen` in reassessment mode for the ACTIVE assessment.
- Close opens the existing result screen and Phase 3 close form.
- Create/view warning opens the existing warning create/review/detail screens where the related visible assessment and warning support it.
- Soft delete remains available only from eligible CLOSED historical assessment detail; Monitoring cards do not duplicate that action.

Typed Expo Router paths are used. List and detail refresh on focus and expose a manual refresh/retry control. Loading, failure, and empty states remain distinct.

## Error Handling and Compatibility

All endpoints are read-only. Invalid incident IDs use existing validation behavior; a well-formed missing detail ID returns 404. Failed source queries are surfaced as API failures, not empty results. Existing initial assessment, reassessment, close, history, soft delete, warning, report verification, and incident grouping behavior remains in place.

No dependencies, schema fields, collections, risk algorithms, or lifecycle mutations are added. The existing one-ACTIVE assessment index and Phase 4 read filters remain unchanged.

## Verification Plan

API tests will cover officer authorization; never-assessed queue inclusion; ACTIVE/CLOSED/reassessed exclusion from the queue; soft-deleted assessment classification without detail leakage; Monitoring inclusion/exclusion; active and closed summary selection; unknown detail IDs; verified timestamp counting; non-VERIFIED and unrelated report exclusion; reassessment evidence-baseline reset; warning association; and regression behavior for existing risk assessment operations.

Mobile tests will cover the initial-only queue, its empty state, initial-save navigation/message, Monitoring loading/error/retry/empty states, ACTIVE and CLOSED cards, new evidence display, detail navigation, reuse of reassessment/history/close/warning actions, and Phase 4 historical soft-delete placement.

After implementation, run relevant API and mobile tests, monorepo typecheck, lint, and build. Perform the manual A–H end-to-end scenario from the Phase 5 brief when a configured API/database/mobile runtime is available.

## Out of Scope

No physical record movement, separate Monitoring collection, duplicate assessment/history logic, risk recalculation, automatic reassessment/warnings/close, reopening CLOSED assessments, hard delete/restore, new risk algorithm, external weather/sensor feeds, WebSockets, polling, push delivery, non-officer monitoring, or unrelated UI redesign.
