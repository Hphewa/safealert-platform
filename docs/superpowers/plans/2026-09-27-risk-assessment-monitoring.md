# Phase 5 Risk Assessment Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the Disaster Officer initial-assessment queue from ongoing incident monitoring while preserving the Phase 1–4 assessment lifecycle.

**Architecture:** Add an `IncidentLifecycleService` that composes batched incident, assessment, report, and warning repository reads behind officer-only incident endpoints. Add shared monitoring contracts and replace the Monitoring placeholder with list/detail screens that reuse existing assessment and warning screens; keep soft-delete history filtered from display while counting deleted assessment documents for lifecycle classification.

**Tech Stack:** TypeScript, Express, Mongoose, Zod, Vitest, shared `@safealert/contracts`, React Native, Expo Router.

**Spec:** `docs/superpowers/specs/2026-09-27-risk-assessment-monitoring-design.md`

## Global Constraints

- Use strict TypeScript and shared `@safealert/contracts` response types.
- The backend authorization boundary remains authentication plus `DISASTER_OFFICER` role authorization.
- Monitoring is read-only and does not move or duplicate records, change incident or assessment state, recalculate risk, create warnings automatically, or alter report verification.
- Soft-deleted assessments count for “ever assessed” classification, but their details and audit metadata never appear in monitoring responses.
- Use `verifiedAt > currentAssessment.assessedAt` for new verified evidence; do not persist an evidence counter.
- Reuse existing assessment, history, close, reassessment, warning, and soft-delete screens and APIs.
- Do not add dependencies, polling, caching, real-time infrastructure, or unrelated UI changes.
- Preserve the one-ACTIVE-assessment partial unique index and Phase 4 read filters.

## Review Focus

- An incident whose only assessment is soft-deleted remains in Monitoring and is excluded from the initial queue, with no deleted detail exposed. Pin in Task 1 and Task 3 service/API tests.
- A report verified at exactly the current assessment time is not new evidence; only strictly later `verifiedAt` values count. Pin in Task 3 service tests.
- RESOLVED and CLOSED incidents with assessment history remain in Monitoring, while the initial queue includes only ACTIVE eligible incidents. Pin in Task 3 API tests.
- An incident with history but no visible assessment gets a neutral no-active-assessment state and no warning details from hidden assessments. Pin in Task 3 and Task 5 tests.
- Reassessment uses the replacement assessment timestamp as the evidence baseline, so prior new evidence resets without mutating reports. Pin in Task 3 and Task 5 tests.
- A legacy VERIFIED report without `verifiedAt` still counts as verified, but is not classified as new and cannot supply a latest verification timestamp. Pin in Task 3 service tests.

---

### Task 1: Shared contracts and incident/assessment lifecycle queries

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/modules/incidents/repositories/incident.repository.ts`
- Modify: `apps/api/src/modules/incidents/repositories/mongooseIncident.repository.ts`
- Modify: `apps/api/src/modules/incidents/repositories/inMemoryIncident.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/riskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/mongooseRiskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/inMemoryRiskAssessment.repository.ts`
- Test: `apps/api/src/modules/incidents/tests/incident.lifecycle.repository.test.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.lifecycle.repository.test.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.persistence.test.ts`

**Interfaces:**
- Add `InitialAssessmentQueueResponse`, `MonitoringAssessmentSummary`, `MonitoringReportSummary`, `MonitoringWarningSummary`, `IncidentMonitoringSummary`, `IncidentMonitoringListResponse`, and `IncidentMonitoringDetailResponse` matching the approved spec.
- Add `IncidentRepository.findAll(): Promise<SafeIncident[]>` for Monitoring across ACTIVE, RESOLVED, and CLOSED incident statuses. Preserve `findActive()` for the initial queue.
- Add internal `AssessmentLifecycleForIncident` with `{ incidentId: string; hasEverBeenAssessed: boolean; currentAssessment: MonitoringAssessmentSummary | null; latestAssessment: MonitoringAssessmentSummary | null }`.
- Add `RiskAssessmentRepository.findLifecycleByIncidentIds(incidentIds: string[]): Promise<AssessmentLifecycleForIncident[]>`. `hasEverBeenAssessed` includes deleted documents; both assessment summaries exclude deleted documents.

- [ ] **Step 1: Write the failing incident repository tests**
  - `findAll` returns cloned incidents across all statuses in deterministic updated-time order.
  - Existing `findActive` still returns only ACTIVE incidents.
- [ ] **Step 2: Run the incident repository tests and confirm they fail**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/incidents/tests/incident.lifecycle.repository.test.ts`

Expected: FAIL because `findAll` is not implemented.

- [ ] **Step 3: Write failing risk-assessment lifecycle repository tests**
  - No assessment returns `hasEverBeenAssessed: false` and null summaries.
  - ACTIVE assessment populates both current and latest summaries.
  - CLOSED/reassessed records return the newest visible assessment as latest and no current assessment.
  - A deleted-only incident returns `hasEverBeenAssessed: true` with null summaries; a deleted predecessor is omitted while its visible ACTIVE successor remains current and linked.
  - Requesting multiple incident IDs returns grouped results in one repository operation.
- [ ] **Step 4: Run the risk-assessment lifecycle tests and confirm they fail**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/risk-assessments/tests/riskAssessment.lifecycle.repository.test.ts src/modules/risk-assessments/tests/riskAssessment.persistence.test.ts`

Expected: FAIL because the lifecycle query and result type are absent.

- [ ] **Step 5: Implement the shared DTOs and batched incident/assessment methods**

Implement `findAll` in both incident repositories. Implement `findLifecycleByIncidentIds` in both assessment repositories; Mongo queries must return only summaries for visible records while still detecting any record, including soft-deleted records. Keep Mongoose filtering consistent with Phase 4 and do not change the ACTIVE unique index.

- [ ] **Step 6: Run Task 1 tests**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/incidents/tests/incident.lifecycle.repository.test.ts src/modules/risk-assessments/tests/riskAssessment.lifecycle.repository.test.ts src/modules/risk-assessments/tests/riskAssessment.persistence.test.ts`

Expected: in-memory lifecycle tests pass; Mongo persistence tests pass when `RISK_ASSESSMENT_TEST_MONGODB_URI` is configured and otherwise report the existing configured skip.

- [ ] **Step 7: Commit Task 1**

```bash
git add packages/contracts/src/index.ts apps/api/src/modules/incidents/repositories apps/api/src/modules/incidents/tests/incident.lifecycle.repository.test.ts apps/api/src/modules/risk-assessments/repositories apps/api/src/modules/risk-assessments/tests/riskAssessment.lifecycle.repository.test.ts apps/api/src/modules/risk-assessments/tests/riskAssessment.persistence.test.ts
git commit -m "feat: add incident lifecycle summary queries"
```

### Task 2: Batched report and warning summaries

**Files:**
- Modify: `apps/api/src/modules/reports/repositories/report.repository.ts`
- Modify: `apps/api/src/modules/reports/repositories/mongooseReport.repository.ts`
- Modify: `apps/api/src/modules/reports/repositories/inMemoryReport.repository.ts`
- Modify: `apps/api/src/modules/warnings/repositories/warning.repository.ts`
- Modify: `apps/api/src/modules/warnings/repositories/mongooseWarning.repository.ts`
- Modify: `apps/api/src/modules/warnings/repositories/inMemoryWarning.repository.ts`
- Test: `apps/api/src/modules/reports/tests/report.lifecycle.repository.test.ts`
- Test: `apps/api/src/modules/warnings/tests/warning.lifecycle.repository.test.ts`

**Interfaces:**
- Add `ReportRepository.findVerifiedSummariesByIds(reportIds: string[]): Promise<MonitoringReportSummary[]>`. Return only VERIFIED reports with `id`, `description`, `severity`, and `verifiedAt`.
- Add `WarningRepository.findByAssessmentIds(assessmentIds: string[]): Promise<SafeWarning[]>` as one batch query; the service will project warning summaries.

- [ ] **Step 1: Write failing report-summary repository tests**
  - Return summaries for requested VERIFIED reports only.
  - Exclude PENDING, REJECTED, CANCELLED, and IDs outside the requested set.
  - Empty ID input returns an empty array without querying.
- [ ] **Step 2: Run the report-summary tests and confirm they fail**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/reports/tests/report.lifecycle.repository.test.ts`

Expected: FAIL because the batched summary method is absent.

- [ ] **Step 3: Write failing warning repository tests**
  - Return warnings for all requested assessment IDs, including both DRAFT and PUBLISHED statuses.
  - Exclude warnings for assessments outside the requested set; empty IDs return an empty array.
- [ ] **Step 4: Run the warning repository tests and confirm they fail**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/warnings/tests/warning.lifecycle.repository.test.ts`

Expected: FAIL because the batch lookup is absent.

- [ ] **Step 5: Implement both batch methods**

Use a single `$in` query per repository and project only report fields needed by the monitoring service. Preserve warning lifecycle behavior.

- [ ] **Step 6: Run Task 2 tests**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/reports/tests/report.lifecycle.repository.test.ts src/modules/warnings/tests/warning.lifecycle.repository.test.ts`

Expected: both repository test files pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/api/src/modules/reports/repositories apps/api/src/modules/reports/tests/report.lifecycle.repository.test.ts apps/api/src/modules/warnings/repositories apps/api/src/modules/warnings/tests/warning.lifecycle.repository.test.ts
git commit -m "feat: add batched monitoring evidence queries"
```

### Task 3: Incident lifecycle service and officer API

**Files:**
- Create: `apps/api/src/modules/incidents/services/incidentLifecycle.service.ts`
- Create: `apps/api/src/modules/incidents/tests/incidentLifecycle.service.test.ts`
- Modify: `apps/api/src/modules/incidents/controllers/incident.controller.ts`
- Modify: `apps/api/src/modules/incidents/routes/incident.routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/incidents/tests/incident.integration.test.ts`

**Interfaces:**
- `IncidentLifecycleService.listInitialAssessmentQueue(): Promise<InitialAssessmentQueueResponse>`
- `IncidentLifecycleService.listMonitoring(): Promise<IncidentMonitoringListResponse>`
- `IncidentLifecycleService.getMonitoringDetail(incidentId: string): Promise<IncidentMonitoringDetailResponse>`
- Routes: `GET /api/v1/incidents/assessment-queue`, `GET /api/v1/incidents/monitoring`, and `GET /api/v1/incidents/monitoring/:incidentId`.
- Construct the lifecycle service from resolved incident, report, assessment, and warning repositories in `createApp`; preserve all existing constructor injection points.

- [ ] **Step 1: Write failing service tests for lifecycle classification and evidence composition**
  - Queue includes only ACTIVE incidents with verified reports and no assessment document ever created.
  - Monitoring includes assessed incidents across incident statuses and excludes never-assessed incidents.
  - For a deleted-only incident, monitoring retains the incident with null summaries and exposes no deletion fields.
  - Active assessment selection, closed latest summary, warning projection, total verified count, latest verification time, and recent-five ordering are correct.
  - `verifiedAt` after current `assessedAt` counts; equality and earlier values do not. PENDING/REJECTED/unrelated reports do not count.
  - A VERIFIED report with missing `verifiedAt` counts toward total verified reports, not new evidence, and does not set `latestVerifiedReportAt`.
  - Reassessment changes the evidence baseline to the new ACTIVE `assessedAt` without changing report records.
  - Detail returns 404 for missing or never-monitored incidents.
- [ ] **Step 2: Run the service tests and confirm they fail**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/incidents/tests/incidentLifecycle.service.test.ts`

Expected: FAIL because `IncidentLifecycleService` does not exist.

- [ ] **Step 3: Implement the focused lifecycle service**

Batch `findActive`/`findAll`, lifecycle summaries, report summaries, and warning lookup by IDs. Compose the approved shared DTOs. Add the concise comment explaining why the assessment-existence result includes soft-deleted records. Keep the service read-only and do not call repositories once per incident.

- [ ] **Step 4: Write failing endpoint and authorization tests**
  - Each endpoint requires authentication and `DISASTER_OFFICER`.
  - List responses use the exact shared DTOs; malformed detail ID follows existing ID validation; missing and never-monitored detail return 404.
  - API responses never expose `isDeleted`, deletion audit fields, or deleted assessment summaries.
  - Existing incident endpoints and initial assessment creation remain unchanged.
- [ ] **Step 5: Run incident API tests and confirm the new assertions fail**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/incidents/tests/incident.integration.test.ts`

Expected: new route assertions fail because routes are not registered.

- [ ] **Step 6: Implement controller, route registration, and app composition**

Keep controller handlers limited to path validation and service calls. Register endpoints before the `/:incidentId` route and inherit the existing officer middleware.

- [ ] **Step 7: Run Task 3 focused tests**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/incidents/tests/incidentLifecycle.service.test.ts src/modules/incidents/tests/incident.integration.test.ts src/modules/risk-assessments/tests/riskAssessment.integration.test.ts src/modules/warnings/tests/warning.integration.test.ts`

Expected: all new lifecycle tests and existing assessment/warning regression tests pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/api/src/modules/incidents/services/incidentLifecycle.service.ts apps/api/src/modules/incidents/controllers/incident.controller.ts apps/api/src/modules/incidents/routes/incident.routes.ts apps/api/src/modules/incidents/tests/incidentLifecycle.service.test.ts apps/api/src/modules/incidents/tests/incident.integration.test.ts apps/api/src/app.ts
git commit -m "feat: add officer incident monitoring endpoints"
```

### Task 4: Initial-assessment API adapter and queue UI

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/api/incidentApi.ts`
- Test: `apps/mobile/src/features/dashboards/officer/api/incidentApi.test.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.tsx`
- Test: `apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.test.tsx`

**Interfaces:**
- Add `listInitialAssessmentQueue(accessToken: string): Promise<InitialAssessmentQueueResponse>` using `GET /incidents/assessment-queue` through `apiRequest`.
- The Assessments screen loads only this API and keeps `CreateRiskAssessmentScreen` for eligible rows.

- [ ] **Step 1: Write failing API adapter tests**
  - Assert GET path, access token, typed response, and no per-incident calls.
- [ ] **Step 2: Run adapter tests and confirm they fail**

Run: `npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer/api/incidentApi.test.ts`

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Write failing queue-screen tests**
  - Render only queue response incidents with the initial “ASSESS RISK” action.
  - Do not render view/reassess/close/delete actions or a previously assessed incident.
  - Show the exact initial-queue empty state; preserve loading/error/retry behavior.
- [ ] **Step 4: Run queue-screen tests and confirm they fail**

Run: `npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.test.tsx`

Expected: FAIL because the current screen still calls the active incident and per-incident assessment APIs.

- [ ] **Step 5: Implement the queue adapter and update the Assessments screen**

Keep existing card styling and initial form routing. Remove the per-incident current/history lookup from this screen.

- [ ] **Step 6: Run Task 4 tests**

Run: `npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer/api/incidentApi.test.ts apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.test.tsx`

Expected: both files pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/mobile/src/features/dashboards/officer/api/incidentApi.ts apps/mobile/src/features/dashboards/officer/api/incidentApi.test.ts apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.tsx apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.test.tsx
git commit -m "feat: limit assessments to initial risk review"
```

### Task 5: Monitoring list/detail screens and lifecycle actions

**Files:**
- Create: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringScreen.tsx`
- Create: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringScreen.test.tsx`
- Create: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.tsx`
- Create: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.test.tsx`
- Create: `apps/mobile/app/officer/monitoring/index.tsx`
- Create: `apps/mobile/app/officer/monitoring/[incidentId].tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/api/incidentApi.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/api/incidentApi.test.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerPlaceholderScreen.tsx`

**Interfaces:**
- Add `listIncidentMonitoring(accessToken: string): Promise<IncidentMonitoringListResponse>` using `GET /incidents/monitoring`.
- Add `getIncidentMonitoringDetail(incidentId: string, accessToken: string): Promise<IncidentMonitoringDetailResponse>` using `GET /incidents/monitoring/:incidentId`.
- Monitoring list/detail screens consume only shared monitoring DTOs and route actions to existing officer screens.

- [ ] **Step 1: Write failing monitoring API adapter tests**
  - Assert each GET path, encoded incident ID, access token, and typed response.
- [ ] **Step 2: Run adapter tests and confirm they fail**

Run: `npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer/api/incidentApi.test.ts`

Expected: FAIL because monitoring adapters are absent.

- [ ] **Step 3: Write failing monitoring-list tests**
  - Cover loading, retryable error, empty state, ACTIVE/current summary, CLOSED/latest summary, evidence count/badge, and navigation to selected incident detail.
- [ ] **Step 4: Run monitoring-list tests and confirm they fail**

Run: `npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringScreen.test.tsx`

Expected: FAIL because the Monitoring screen does not exist.

- [ ] **Step 5: Write failing monitoring-detail tests**
  - Cover incident/status summary, current and latest closed states, no-visible-assessment neutral state, recent evidence, warning status, retry/refresh, and typed navigation to View Assessment, Reassess, Close, Create/View Warning.
  - Offer Create Warning only for a current ACTIVE HIGH/CRITICAL assessment; preserve View Warning for supported current warning records.
  - Assert soft-delete action is not duplicated on the monitoring detail screen.
- [ ] **Step 6: Run monitoring-detail tests and confirm they fail**

Run: `npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.test.tsx`

Expected: FAIL because the detail screen does not exist.

- [ ] **Step 7: Implement monitoring adapters, list/detail screens, and Expo routes**

Use existing dashboard components/styles, `useFocusEffect` and manual refresh/retry patterns. The Monitoring empty state must read “No assessed incidents are currently available for monitoring.” Remove only the Monitoring entry from placeholder content. Keep Profile placeholder behavior.

- [ ] **Step 8: Run Task 5 mobile tests**

Run: `npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer/api/incidentApi.test.ts apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringScreen.test.tsx apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.test.tsx`

Expected: all three test files pass.

- [ ] **Step 9: Commit Task 5**

```bash
git add apps/mobile/app/officer/monitoring apps/mobile/src/features/dashboards/officer/api/incidentApi.ts apps/mobile/src/features/dashboards/officer/api/incidentApi.test.ts apps/mobile/src/features/dashboards/officer/screens/OfficerPlaceholderScreen.tsx apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringScreen.tsx apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringScreen.test.tsx apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.tsx apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.test.tsx
git commit -m "feat: add officer incident monitoring screens"
```

### Task 6: Initial-save transition and Phase 1–4 integration

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.tsx`
- Test: `apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.test.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.tsx`
- Test: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.test.tsx`
- Test: `apps/api/src/modules/incidents/tests/incident.integration.test.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.integration.test.ts`
- Test: `apps/api/src/modules/warnings/tests/warning.integration.test.ts`

**Interfaces:**
- Initial create success replaces the form with `/officer/monitoring/[incidentId]` and a success notice. Reassessment success continues to replace the form with the existing assessment result route.
- Monitoring detail consumes the notice once and shows the approved save message.

- [ ] **Step 1: Write failing initial-save navigation tests**
  - Initial create navigates to Monitoring detail for the returned incident and carries the success notice.
  - Reassessment still navigates to the saved assessment result screen.
- [ ] **Step 2: Run create-screen tests and confirm the new assertions fail**

Run: `npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.test.tsx`

Expected: initial create still routes to the assessment result screen.

- [ ] **Step 3: Write failing success-notice and Phase 1–4 lifecycle regressions**
  - Monitoring detail renders and consumes the initial-save notice.
  - Initial create removes the incident from the queue and makes it visible in Monitoring.
  - Reassessment shows the replacement ACTIVE assessment and resets new-evidence count.
  - Closing leaves the incident in Monitoring with the latest CLOSED summary and keeps it out of the queue.
  - Soft-deleting the only visible CLOSED assessment leaves the incident in Monitoring without deleted details.
  - Warning creation and existing assessment-history/soft-delete access remain reachable through reused screens.
- [ ] **Step 4: Run the focused API/mobile regressions and confirm the new assertions fail**

Run: `npm.cmd --workspace @safealert/api test -- src/modules/incidents/tests/incident.integration.test.ts src/modules/risk-assessments/tests/riskAssessment.integration.test.ts src/modules/warnings/tests/warning.integration.test.ts`

Run: `npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.test.tsx apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.test.tsx`

Expected: the new lifecycle/nav assertions fail before implementation while existing tests remain green.

- [ ] **Step 5: Implement initial-save navigation and success feedback**

On initial creation only, navigate directly to Monitoring detail using the incident ID in the create response. Keep reassessment navigation unchanged. Display the approved success text on the detail screen.

- [ ] **Step 6: Run focused regression tests**

Run the same API and mobile commands from Step 4.

Expected: new and existing focused tests pass.

- [ ] **Step 7: Run final officer/API verification and quality checks**

Run:

```powershell
npm.cmd --workspace @safealert/api test
npm.cmd exec -- vitest run apps/mobile/src/features/dashboards/officer
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: all new tests, officer mobile tests, typecheck, lint, build, and whitespace checks pass. Report any API suite failures that were present at baseline; do not suppress or weaken tests.

When a configured API/database/mobile runtime is available, also walk the brief's exact A–H scenario: (A) verify a never-assessed incident appears only in Assessments; (B) save HIGH/18/ACTIVE and verify it leaves Assessments, appears in Monitoring, shows success feedback and zero new evidence; (C) verify a later report and confirm evidence increments while official risk stays HIGH; (D) reassess to CRITICAL and confirm the prior report no longer counts as new; (E) verify another report and confirm the count increments; (F) close the current assessment and confirm the incident remains in Monitoring with CLOSED summary; (G) open history and confirm both non-deleted assessments remain; (H) soft-delete an eligible CLOSED assessment and confirm normal history hides it, MongoDB retains the same `_id` with `isDeleted: true`, and the incident stays in Monitoring.

- [ ] **Step 8: Review the complete change set**

Verify the initial queue excludes any incident with assessment history including deleted records; Monitoring never exposes deleted assessment details; no N+1 client calls were added; assessment unique index and Phase 4 filters are unchanged; new evidence uses strict `verifiedAt > assessedAt`; warning/history/reassess/close/soft-delete flows reuse existing screens; no unrelated files or dependencies changed.

- [ ] **Step 9: Commit Task 6**

```bash
git add apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.tsx apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.test.tsx apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.tsx apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.test.tsx apps/api/src/modules/incidents/tests/incident.integration.test.ts apps/api/src/modules/risk-assessments/tests/riskAssessment.integration.test.ts apps/api/src/modules/warnings/tests/warning.integration.test.ts
git commit -m "feat: connect initial assessment to monitoring lifecycle"
```
