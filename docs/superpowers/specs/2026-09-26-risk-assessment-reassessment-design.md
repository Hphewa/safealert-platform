# Risk Assessment Reassessment Design

## Goal and scope

Implement officer-led reassessment for an active incident assessment. Reassessment creates a new assessment and preserves the previous record as history. It does not edit existing factors or decisions, and it does not add manual close, void, delete, or generic edit workflows.

The existing `ACTIVE`, `CLOSED`, and `VOID` statuses remain. The existing partial unique index allowing one `ACTIVE` assessment per incident remains unchanged. All risk calculation and the incident eligibility rules remain server-owned.

## Data and shared contracts

Extend `SafeRiskAssessment` with optional fields so existing stored assessments remain readable:

- `previousAssessmentId?: string`
- `reassessmentReason?: string`
- `closureReason?: 'REASSESSED'`
- `closedAt?: string`
- `closedById?: string`

The Mongoose schema will persist matching fields, with ObjectId references for assessment/user identifiers, enum validation for `closureReason`, and date storage for `closedAt`. These fields describe reassessment history only; no `SUPERSEDED` status is introduced.

Add `ReassessRiskAssessmentRequest`, containing the existing assessment factors, `finalRiskLevel`, optional `decisionReason`, and required `reassessmentReason`. The route path identifies the current assessment, so the request will not accept `incidentId`. Strict Zod parsing trims both reasons, enforces the established 10–500 character rule for the required reassessment reason, preserves the existing decision-reason rule, rejects unknown fields, and excludes server-owned scoring, status, and audit fields.

## API and service flow

Add `POST /api/v1/risk-assessments/:assessmentId/reassess` to the existing router protected by `authenticate` and `authorizeRoles('DISASTER_OFFICER')`. The controller validates the path ID and request, takes the officer ID from authenticated request context, and returns HTTP 201 with the existing `RiskAssessmentResponse` shape: `{ assessment, incident, reports }`.

The service loads the referenced assessment, returns 404 if missing, and returns a 409 conflict if it is no longer `ACTIVE`. It loads the current incident and reports through the same eligibility path as normal assessment creation, including active incident and at least one currently verified linked report. It calculates score and suggested risk using the existing `calculateRisk` implementation, applies the existing officer override rule, and passes only validated, server-derived values to a dedicated repository reassessment operation.

The service returns the new assessment with the same incident and report context used for validation. Existing create, calculate, read, active lookup, and history semantics remain unchanged.

## Atomic persistence and concurrency

The repository exposes a focused `reassess(activeAssessmentId, newAssessment)` operation. The Mongoose implementation initializes the existing model/index before writes, starts a session transaction, conditionally updates the old record with `{ _id, status: 'ACTIVE' }`, and writes `status: 'CLOSED'`, `closureReason: 'REASSESSED'`, `closedAt`, and authenticated `closedById`. If that conditional update matches no document, the request is stale and fails as a conflict. It then inserts a new `ACTIVE` record in the same incident with `previousAssessmentId`, `reassessmentReason`, and server-derived assessment data, and commits only after both writes succeed.

Any validation, insertion, or transaction failure aborts the transaction, preserving the old ACTIVE record. The existing partial unique index remains the final arbiter of the one-ACTIVE invariant. Duplicate-active and stale transition errors map to a domain conflict (HTTP 409); index readiness retains the existing 503 storage error convention. No raw MongoDB error is returned to clients.

The in-memory repository performs the transition without yielding between the active-state/uniqueness checks and map mutations. It constructs the new record first, then updates the old and inserts the new synchronously, preserving all-or-nothing behavior for service and API tests.

## Mobile flow

Reuse `CreateRiskAssessmentScreen` with an optional `assessmentId` route parameter. Without it, create behavior remains unchanged. With it, load the selected assessment, require it to be ACTIVE, prefill the existing factor form, and show the current risk/score plus a required reassessment-reason input. Continue using the existing calculation preview and `RiskDecisionScreen`; any factor edit clears the preview. The reassessment save path submits factors, the required reassessment reason, and officer decision to the new API call. Duplicate submissions remain disabled while saving. On success, replace the route with the existing result screen for the new assessment ID. On failure, keep the route and entered form state; stale-assessment conflicts receive a clear refresh-oriented message.

The result screen adds a `REASSESS RISK` action only when the loaded assessment is `ACTIVE`, passing its ID to the reused screen. CLOSED and VOID records do not expose that action. The result screen's existing history request remains authoritative and naturally displays the new ACTIVE record and its CLOSED predecessor after navigation to the new result.

Existing history rows display reassessment lineage and closure audit fields when present, including the previous assessment ID, reassessment reason, closure reason, closure time, and closing officer. Older records without these optional fields continue to render as before.

## Error behavior

- 400: malformed ID or invalid/unknown request input; existing decision-reason validation errors remain 400.
- 401/403: existing authentication and officer-role middleware.
- 404: assessment or incident not found.
- 409: old assessment is not ACTIVE, concurrent/stale reassessment, or incident is no longer eligible.
- 503: existing risk-assessment index/storage readiness mapping.

The mobile error mapper will recognize the stale/non-active reassessment conflict and retain the entered values for retry or navigation back to refreshed state.

## Verification

Add repository/service/API tests for successful linkage and closure metadata, history order, single-active enforcement, stale/concurrent attempts, failure rollback where the persistence test environment supports transactions, eligibility and scoring rules, authenticated officer identity, request validation, authorization, and existing route regression behavior. Add focused mobile tests for ACTIVE-only action, prefilled factors, validation, cleared stale preview, save navigation, failed-save state preservation, and history content where the existing test harness supports these behaviors.

Run the relevant API and mobile tests, TypeScript checks, lint, and build commands. Mongo transaction integration tests use a dedicated MongoDB URI and are skipped when no test URI is configured; when configured, that server must be a replica set or sharded cluster. Do not change deployment infrastructure or add dependencies.
