# Risk Assessment Reassessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add officer-led reassessment that atomically closes an active assessment and creates a linked active replacement while preserving assessment history.

**Architecture:** Extend the shared contract and Mongoose model with optional lifecycle metadata. The service reuses current eligibility, calculation, and decision rules; a dedicated repository operation performs the conditional close and insert in one MongoDB transaction, with matching synchronous semantics in memory. The mobile app reuses the existing create and result screens.

**Tech Stack:** TypeScript, Express, Zod, Mongoose 9, MongoDB transactions, React Native, Expo Router, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-26-risk-assessment-reassessment-design.md`

## Global Constraints

- Preserve `ACTIVE`, `CLOSED`, and `VOID`; do not add `SUPERSEDED` or manual close/void/delete/edit workflows.
- Preserve the `one_active_assessment_per_incident` partial unique index.
- Keep calculation, assessor identity, status, and lifecycle timestamps server-owned.
- Keep strict request validation, current auth/RBAC, current eligibility rules, and current create behavior.
- Do not add dependencies or change MongoDB deployment infrastructure.
- Mongo persistence tests must use a dedicated URI and isolated collection; the URI must target a replica set or sharded cluster.
- The user will handle commits; do not create commits during implementation.

## Review Focus

- Invalid or whitespace-only reassessment reasons must fail before persistence. Pin in Task 1's schema tests.
- A stale or racing request must not close an already-closed assessment or produce a second active assessment. Pin in Tasks 2 and 3.
- A failure after the old assessment is conditionally closed must roll back the transaction. Pin in Task 2's Mongo transaction test.
- Current verified-report eligibility and server recalculation must remain authoritative. Pin in Task 3's service/API tests.
- Reassessment form input must survive API failure, and a stale conflict must be actionable. Pin in Task 5's mobile screen tests.

---

### Task 1: Shared lifecycle contracts and strict validation

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/modules/risk-assessments/models/riskAssessment.model.ts`
- Modify: `apps/api/src/modules/risk-assessments/validation/riskAssessment.schemas.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.model.test.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.schemas.test.ts`

**Interfaces:**
- Produce `ReassessRiskAssessmentRequest = RiskAssessmentFactors & { finalRiskLevel: RiskLevel; decisionReason?: string; reassessmentReason: string }`.
- Extend `SafeRiskAssessment` with optional `previousAssessmentId`, `reassessmentReason`, `closureReason`, `closedAt`, and `closedById` fields.
- Export a strict `reassessRiskAssessmentSchema` that excludes `incidentId` and all server-owned fields.

- [x] **Step 1: Write failing schema tests**

Test valid trimmed request parsing; required reassessment reason; 10–500 character limits; whitespace and overlength rejection; factor count validation; optional decision reason behavior; and rejection of `incidentId`, `calculatedScore`, `systemSuggestedRisk`, `status`, and audit fields.

- [x] **Step 2: Run the schema tests and confirm failure**

Run: `npm --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.schemas.test.ts`

Expected: FAIL because the reassessment schema and contract do not exist.

- [x] **Step 3: Add contract and model lifecycle fields**

Use optional response fields for backward compatibility. Persist assessment/user references as ObjectIds, closure reason as the single allowed value `REASSESSED`, and `closedAt` as a date. Serialize only fields that exist.

- [x] **Step 4: Add and verify strict reassessment validation**

Build from the existing factor schema, apply the same vulnerable-count refinement and decision-reason constraints, and trim/require the reassessment reason using the shared 10–500 constants.

Run: `npm --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.schemas.test.ts src/modules/risk-assessments/tests/riskAssessment.model.test.ts`

Expected: PASS.

### Task 2: Atomic repository lifecycle operation

**Files:**
- Modify: `apps/api/src/modules/risk-assessments/repositories/riskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/mongooseRiskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/inMemoryRiskAssessment.repository.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.repository.test.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.persistence.test.ts`

**Interfaces:**
- Add `ReassessRiskAssessmentRecordInput`, containing the new record's incident, factors, final decision, server-calculated fields, assessor ID, assessed time, and required reassessment reason; it must not allow callers to set closure metadata or previous ID.
- Add `RiskAssessmentRepository.reassess(activeAssessmentId: string, input: ReassessRiskAssessmentRecordInput): Promise<SafeRiskAssessment>`.
- Add `RiskAssessmentReassessmentConflictError` for a missing/non-active source or active uniqueness conflict.

- [x] **Step 1: Write failing in-memory repository tests**

Assert successful old ACTIVE → CLOSED and new ACTIVE transition; closure metadata and `closedById`; new `previousAssessmentId` and `reassessmentReason`; history order; one ACTIVE record; stale repeated reassessment conflict; and no state change when new-record construction fails.

- [x] **Step 2: Run repository tests and confirm failure**

Run: `npm --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.repository.test.ts`

Expected: FAIL because the repository operation and lifecycle fields do not exist.

- [x] **Step 3: Implement atomic in-memory transition**

Check source status and incident ACTIVE uniqueness, construct the new record before mutation, then update both map entries synchronously without yielding. Use one timestamp for the old closure and new assessment time.

- [x] **Step 4: Add Mongo transaction tests with isolated storage**

Use `RISK_ASSESSMENT_TEST_MONGODB_URI`, a randomly named collection, and an injected model bound to a dedicated connection. Verify successful transition and history; force a Mongoose create-time cast/validation failure after the old update and assert rollback; run two reassessments concurrently and assert one succeeds, one conflicts, and exactly one ACTIVE assessment remains. Skip only when the URI is absent.

- [x] **Step 5: Implement the Mongoose transaction**

Initialize the model before opening a session. In `withTransaction`, conditionally update `{ _id: activeAssessmentId, status: 'ACTIVE', incidentId: input.incidentId }`; on no match throw the domain conflict; then create the ACTIVE replacement in the same session with the old ID as `previousAssessmentId`. Preserve the existing partial unique index. Map a duplicate-active error to the domain conflict and index initialization failure to the existing 503 storage error. Always end the session in `finally`.

- [x] **Step 6: Run repository and persistence tests**

Run: `npm --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.repository.test.ts src/modules/risk-assessments/tests/riskAssessment.persistence.test.ts`

Expected: in-memory tests PASS; Mongo tests PASS when a transaction-capable test URI is configured, otherwise report as skipped.

### Task 3: Service and protected reassessment endpoint

**Files:**
- Modify: `apps/api/src/modules/risk-assessments/services/riskAssessment.service.ts`
- Modify: `apps/api/src/modules/risk-assessments/controllers/riskAssessment.controller.ts`
- Modify: `apps/api/src/modules/risk-assessments/routes/riskAssessment.routes.ts`
- Modify: `apps/api/src/modules/risk-assessments/tests/riskAssessment.integration.test.ts`

**Interfaces:**
- Add `RiskAssessmentService.reassess(officerId: string, assessmentId: string, input: ReassessRiskAssessmentRequest): Promise<RiskAssessmentResponse>`.
- Add controller handler `reassess`; route it at `POST /:assessmentId/reassess` under existing router authentication and role middleware.

- [x] **Step 1: Write failing API tests**

Cover auth required, officer role required, malformed/missing IDs, valid reassessment response, authenticated officer identity, current active assessment and verified-report eligibility, current score recalculation despite omitted/forged client values, override reason enforcement, strict rejection of trusted fields, stale repeat conflict, and unchanged normal create/calculate/history behavior.

- [x] **Step 2: Run the API test and confirm failure**

Run: `npm --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.integration.test.ts`

Expected: FAIL because the reassessment route does not exist.

- [x] **Step 3: Implement service validation and persistence mapping**

Load source assessment first; map missing to 404 and non-ACTIVE to 409. Reuse `getIncidentWithReports(incidentId, true)`, `calculateRisk`, and existing decision validation. Build the new repository input from request factors, calculated values, authenticated officer ID, current time, and trimmed reassessment reason. Return `{ assessment, incident, reports }`.

- [x] **Step 4: Implement thin controller and route**

Parse the path ID and strict request schema, obtain `request.auth.id`, return 201, and keep existing router-level middleware. Map repository stale/concurrent conflict to a 409 API error without exposing Mongo details.

- [x] **Step 5: Run API regression tests**

Run: `npm --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests`

Expected: all risk-assessment API, model, repository, and calculation tests PASS.

### Task 4: Mobile API and reassessment form helpers

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/riskAssessmentForm.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/riskAssessmentForm.test.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/api/riskAssessmentWorkflow.test.ts`

**Interfaces:**
- Add `reassessRiskAssessment(assessmentId: string, input: ReassessRiskAssessmentRequest, accessToken: string): Promise<RiskAssessmentResponse>`.
- Add a typed form helper to construct the reassessment request with trimmed required reason, existing factors, and existing decision-reason validation.
- Map the stale/non-active reassessment conflict code to a refresh-oriented message in `assessmentErrorMessage`.

- [x] **Step 1: Write failing helper and client-workflow tests**

Test required reassessment reason and trim behavior, existing override validation, request body excludes incident/server-owned fields, API path encodes assessment ID, and the stale conflict error gives a useful refresh instruction.

- [x] **Step 2: Run mobile tests and confirm failure**

Run: `npm --workspace @safealert/mobile exec vitest run src/features/dashboards/officer/riskAssessmentForm.test.ts src/features/dashboards/officer/api/riskAssessmentWorkflow.test.ts`

Expected: FAIL because reassessment request/helper/API support is absent.

- [x] **Step 3: Add reassessment API and typed form helper**

Use the central `apiRequest`, the shared contract, current reason constants, and existing form validation. Do not duplicate factor parsing or decision-reason rules.

- [x] **Step 4: Run mobile helper/workflow tests**

Run the same two test files.

Expected: PASS.

### Task 5: Reuse the create screen and add the ACTIVE-only result action

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/RiskDecisionScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.test.tsx`
- Test: `apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.test.tsx`

**Interfaces:**
- The existing create route accepts optional `assessmentId`; its absence retains create mode, its presence activates reassessment mode.
- Reassessment mode loads `getRiskAssessment`, requires ACTIVE status, prefills factor state, requires a reassessment reason, and uses the existing calculation/decision components.
- Result screen pushes `/officer/assessments/create` with the active assessment ID only when assessment status is ACTIVE.

- [x] **Step 1: Add failing result-screen action tests**

Assert ACTIVE renders and invokes `REASSESS RISK` with its ID; CLOSED and VOID render no reassessment action; the existing warning action remains governed by `canCreateWarning`.

- [x] **Step 2: Add failing create-screen reassessment tests**

Assert route load prepopulates all factors and shows current risk/score; blank or too-short reason blocks submit; changing a factor clears calculation preview; successful save calls reassessment and replaces route with the new ID; rejected save preserves form/reason and remains on screen.

- [x] **Step 3: Run focused mobile screen tests and confirm failure**

Run: `npm --workspace @safealert/mobile exec vitest run src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.test.tsx src/features/dashboards/officer/screens/RiskAssessmentResultScreen.test.tsx`

Expected: FAIL because reassessment mode and action do not exist.

- [x] **Step 4: Implement mode-aware screen behavior**

Keep create mode's loading, eligibility, active-existing, calculation, and save behavior. In reassessment mode load the selected assessment, prefill once per route assessment ID, display the prior decision and required reason, recalculate after factor edits, and submit through the typed reassessment client call. Preserve entered state after failure and prevent duplicate submissions. On success navigate to the returned new assessment ID.

- [x] **Step 5: Add ACTIVE-only result navigation and verify screen tests**

Add the result action for ACTIVE only. Continue using the existing history endpoint; do not create another history mechanism.
Render optional linkage and closure metadata in the existing history rows so reassessment remains auditable in the UI.

Run the two screen test files.

Expected: PASS, including existing result-screen behavior.

### Task 6: Full verification and change review

**Files:**
- Review all files changed by Tasks 1–5.

- [x] **Step 1: Run the full relevant API tests**

Run: `npm --workspace @safealert/api test`

Expected: risk-assessment tests pass; report any unrelated pre-existing failures without hiding or weakening them.

- [x] **Step 2: Run the relevant mobile tests**

Run the officer risk-assessment form, API workflow, create-screen, and result-screen tests using `npm --workspace @safealert/mobile exec vitest run ...`.

Expected: all focused mobile tests pass.

- [x] **Step 3: Run workspace typecheck, lint, and build**

Run: `npm run typecheck`, `npm run lint`, and `npm run build`.

Expected: commands complete; document failures that are unrelated and pre-existing.

- [x] **Step 4: Review the diff and working tree**

Run: `git diff --check` and inspect `git diff --stat` plus the full diff. Confirm only Phase 2 implementation, tests, and the approved design/plan docs changed; confirm no dependencies, deployment settings, or index changes were introduced. Leave commits to the user.
