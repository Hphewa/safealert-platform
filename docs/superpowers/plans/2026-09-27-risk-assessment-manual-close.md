# Risk Assessment Manual Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Disaster Officers manually close ACTIVE assessments with an audited reason while preserving history and preventing closed assessments from creating warnings.

**Architecture:** Extend the shared lifecycle contract and Mongoose model, then add a conditional single-document repository update and protected close endpoint. Reuse the existing history endpoint and officer screens, and gate warning creation by ACTIVE status in the UI and warning service.

**Tech Stack:** TypeScript, shared `@safealert/contracts`, Express, Zod, Mongoose, MongoDB Atlas, React Native, Expo Router, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-27-risk-assessment-manual-close-design.md`

## Global Constraints

- Preserve `ACTIVE`, `CLOSED`, and `VOID`; do not add delete, edit, reopen, or new-after-close workflows.
- Preserve `REASSESSED` as the Phase 2 reason and do not require it to carry a manual closure note.
- Keep the existing `one_active_assessment_per_incident` partial unique index unchanged.
- Use a conditional atomic update for manual close; do not add a transaction for this single-document transition.
- Keep current authentication/RBAC, request strictness, API error conventions, mobile token handling, and repository abstractions.
- Do not change MongoDB Atlas deployment, dependencies, unrelated flows, or the existing create-assessment API policy.
- The user will commit; do not create commits.

## Review Focus

- `OTHER` with missing, blank, whitespace-only, or short note must fail before persistence; pin in Task 1 validation tests.
- An old CLOSED record with `REASSESSED` and no manual note must remain valid; pin in Task 1 model tests.
- Close racing with close or reassessment must yield one lifecycle winner and no extra ACTIVE record; pin in Tasks 2 and 3, plus the URI-gated Mongo test.
- A missing active assessment with existing history must not be shown as “Not assessed” or expose ASSESS INCIDENT; a failed history lookup must not expose that action; pin in Task 6 mobile tests.
- A failed/stale close must preserve the selected reason/note and offer a refresh; a successful close must remove lifecycle actions and refresh history; pin in Task 5 mobile tests.
- A CLOSED HIGH/CRITICAL assessment must not create a warning through the UI or service; pin in Task 6 warning tests.

---

### Task 1: Shared closure contract, model fields, and validation

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/modules/risk-assessments/models/riskAssessment.model.ts`
- Modify: `apps/api/src/modules/risk-assessments/validation/riskAssessment.schemas.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.schemas.test.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.model.test.ts`

**Interfaces:**
- Produce `RISK_ASSESSMENT_MANUAL_CLOSURE_REASONS = ['INCIDENT_RESOLVED', 'HAZARD_NO_LONGER_ACTIVE', 'MONITORING_COMPLETED', 'OTHER'] as const` and `ManualRiskAssessmentClosureReason` in `packages/contracts/src/index.ts`.
- Extend `RISK_ASSESSMENT_CLOSURE_REASONS` with the manual values while retaining `REASSESSED`; expose `CloseRiskAssessmentRequest` with `closureReason: ManualRiskAssessmentClosureReason` and optional `closureNote`; expose `CloseRiskAssessmentResponse = { assessment: SafeRiskAssessment }`.
- Extend `SafeRiskAssessment` with optional `closureNote`.
- Produce strict `closeRiskAssessmentSchema`: note is trimmed, 10–500 chars when supplied, and required for `OTHER`; `REASSESSED` and all unknown/server fields are rejected.

- [x] **Step 1: Write failing contract/schema tests**

Test all four manual reasons; reject `REASSESSED`; reject unknown keys and forged `status`, `closedAt`, and `closedById`; trim valid notes; reject invalid/blank notes; require a note for `OTHER`; permit omitted notes for the three predefined reasons.

- [x] **Step 2: Run schema tests and confirm failure**

Run: `npm.cmd --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.schemas.test.ts`

Expected: FAIL because manual-close contract/schema support is absent.

- [x] **Step 3: Add shared reason/request/response types and model note field**

Extend the existing reason enum/type instead of creating a competing closure domain. Add `closureNote` as optional trimmed text with shared reason length limits. Validate closure metadata conditionally when a recognized closure reason is set, so legacy CLOSED records lacking lifecycle metadata remain valid; require `OTHER` notes for manual closure and do not require notes for `REASSESSED`.

- [x] **Step 4: Implement and verify strict close request validation**

Export `closeRiskAssessmentSchema` from the existing validation module. Derive manual reason values from the shared contract constant, validate `OTHER` note presence, and keep the existing assessment schemas unchanged.

Run: `npm.cmd --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.schemas.test.ts src/modules/risk-assessments/tests/riskAssessment.model.test.ts`

Expected: PASS, including existing reassessment model coverage.

### Task 2: Conditional repository close operation

**Files:**
- Modify: `apps/api/src/modules/risk-assessments/repositories/riskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/inMemoryRiskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/mongooseRiskAssessment.repository.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.repository.test.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.persistence.test.ts`

**Interfaces:**
- Produce `CloseActiveRiskAssessmentInput` with `closureReason: ManualRiskAssessmentClosureReason`, optional `closureNote`, server-provided `closedAt`, and authenticated `closedById`.
- Add `RiskAssessmentRepository.closeActiveAssessment(assessmentId: string, input: CloseActiveRiskAssessmentInput): Promise<SafeRiskAssessment | null>`; null means the conditional ACTIVE transition lost.

- [x] **Step 1: Write failing in-memory repository tests**

Assert a valid ACTIVE close persists CLOSED status, reason, timestamp, officer, and optional note; close without note for predefined reasons works; repeated close and VOID close return null without mutation; concurrent closes have one success; closure does not create another ACTIVE assessment; history contains the closed record.

- [x] **Step 2: Run repository tests and confirm failure**

Run: `npm.cmd --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.repository.test.ts`

Expected: FAIL because `closeActiveAssessment` is not implemented.

- [x] **Step 3: Implement the synchronous in-memory transition**

Check the assessment exists and is ACTIVE, then synchronously replace it with a CLOSED clone populated from the close input. Return null for missing or inactive records and never alter unrelated assessments.

- [x] **Step 4: Implement the Mongo conditional update and persistence coverage**

Use `findOneAndUpdate` with `{ _id: assessmentId, status: 'ACTIVE' }`, set only server-owned lifecycle fields plus the validated reason/note, request the updated document, and serialize it. Return null for no match and map recognized write conflict code 112 to a lost-transition result; preserve unrelated storage errors. In the URI-gated random-collection persistence tests, verify a close, repeated close, concurrent close, close-vs-reassess race, and one-ACTIVE invariant. Do not alter the existing partial index or reassessment transaction.

- [x] **Step 5: Run repository and persistence tests**

Run: `npm.cmd --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.repository.test.ts src/modules/risk-assessments/tests/riskAssessment.persistence.test.ts`

Expected: in-memory tests PASS; Mongo tests PASS with `RISK_ASSESSMENT_TEST_MONGODB_URI` configured for a transaction-capable Atlas/replica-set target, otherwise report the persistence tests as skipped.

### Task 3: Protected close service and API endpoint

**Files:**
- Modify: `apps/api/src/modules/risk-assessments/services/riskAssessment.service.ts`
- Modify: `apps/api/src/modules/risk-assessments/controllers/riskAssessment.controller.ts`
- Modify: `apps/api/src/modules/risk-assessments/routes/riskAssessment.routes.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.integration.test.ts`

**Interfaces:**
- Add `RiskAssessmentService.close(officerId: string, assessmentId: string, input: CloseRiskAssessmentRequest): Promise<CloseRiskAssessmentResponse>`.
- Add controller handler `close` for `PATCH /:assessmentId/close` under existing router-level auth and `DISASTER_OFFICER` middleware.
- Return HTTP 200 `{ assessment }`; missing source maps to 404 `ASSESSMENT_NOT_FOUND`; initial inactive state or repository null maps to 409 `ASSESSMENT_NOT_ACTIVE`.

- [x] **Step 1: Write failing API tests**

Cover unauthenticated and wrong-role rejection; valid officer closure; authenticated `closedById`; server timestamp; note/reason persistence; strict rejection of forged fields and `REASSESSED`; malformed/missing ID; OTHER note rules; repeat close and close VOID conflict; unchanged Phase 2 reassessment closure metadata; and history returns the manually CLOSED assessment.

- [x] **Step 2: Run the close integration cases and confirm failure**

Run: `npm.cmd --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests/riskAssessment.integration.test.ts`

Expected: FAIL because the close route and service operation are absent.

- [x] **Step 3: Implement service mapping and stale conflict behavior**

Load the source first for 404 versus inactive 409. Generate `closedAt` on the server and use the authenticated officer ID. Call the repository’s conditional operation, map null to 409, and return only `{ assessment }`; do not require incident ACTIVE state or verified reports and do not change create/reassess paths.

- [x] **Step 4: Add thin controller and protected PATCH route**

Parse the path ID and strict close schema, require `request.auth`, and call `service.close(request.auth.id, assessmentId, input)`. Rely on existing router middleware for authentication and role authorization.

- [x] **Step 5: Run API lifecycle regression tests**

Run: `npm.cmd --workspace @safealert/api exec vitest run src/modules/risk-assessments/tests`

Expected: all risk-assessment tests PASS; URI-gated Mongo persistence cases are reported as skipped when no test URI is set.

### Task 4: Mobile close API and request helper

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/riskAssessmentForm.ts`
- Test: `apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.test.ts`
- Test: `apps/mobile/src/features/dashboards/officer/api/riskAssessmentWorkflow.test.ts`
- Test: `apps/mobile/src/features/dashboards/officer/riskAssessmentForm.test.ts`

**Interfaces:**
- Produce `closeRiskAssessment(assessmentId: string, input: CloseRiskAssessmentRequest, accessToken: string): Promise<CloseRiskAssessmentResponse>` using central `apiRequest` and `PATCH`.
- Produce `closureNoteError(reason: ManualRiskAssessmentClosureReason, note: string): string | null` and `buildCloseRiskAssessmentRequest(reason, note): CloseRiskAssessmentRequest` with trim/required-note validation.

- [x] **Step 1: Write failing API/helper tests**

Test encoded assessment path, PATCH method, request body, response typing, allowed reasons, note trimming/omission, OTHER note requirement, shared 10–500 limits, and no server-owned request fields.

- [x] **Step 2: Run mobile API/helper tests and confirm failure**

Run: `npm.cmd --workspace @safealert/mobile exec vitest run src/features/dashboards/officer/api/riskAssessmentApi.test.ts src/features/dashboards/officer/api/riskAssessmentWorkflow.test.ts src/features/dashboards/officer/riskAssessmentForm.test.ts`

Expected: FAIL because close API/helper support is absent.

- [x] **Step 3: Implement the typed client and request helper**

Use shared closure reason/request/response contracts, the existing API base client, `encodeURIComponent`, and shared reason-length constants. Do not duplicate server fields in the request.

- [x] **Step 4: Run mobile API/helper tests**

Run the same three files.

Expected: PASS.

### Task 5: Result-screen close confirmation and lifecycle refresh

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.test.tsx`

**Interfaces:**
- Add ACTIVE-only `CLOSE ASSESSMENT` action and inline confirmation form using shared manual-reason radio options, note input, and existing screen buttons/styles.
- On success, apply the returned `CloseRiskAssessmentResponse` to the visible result, refresh existing assessment history, and remove ACTIVE-only actions.
- On stale 409, preserve entered values, show a refresh-oriented error, and allow `useAssessmentResource.reload()`.

- [x] **Step 1: Write failing result-screen tests**

Test ACTIVE-only warning/reassess/close action visibility; confirmation form open/cancel; no `REASSESSED` option; OTHER note required; duplicate submit prevention; successful PATCH updates status and refreshes history; failed PATCH preserves reason/note and does not claim success; stale conflict exposes refresh; CLOSED and VOID remain view-only.

- [x] **Step 2: Run result-screen tests and confirm failure**

Run: `npm.cmd --workspace @safealert/mobile exec vitest run src/features/dashboards/officer/screens/RiskAssessmentResultScreen.test.tsx`

Expected: FAIL because manual close UI and API action are absent.

- [x] **Step 3: Implement the close confirmation form and submit flow**

Use `AssessmentOptions`, `AssessmentButton`, `TextInput`, and current assessment styles. Keep local selection/note on error, guard with an in-flight ref, disable actions while busy, and use inline existing error/success display conventions. Render CREATE WARNING only when assessment status is ACTIVE and risk is HIGH/CRITICAL.

- [x] **Step 4: Update local status from the response and refresh history**

Keep an optional closed response as the screen’s displayed assessment after success, close the form, show success feedback, and trigger the existing history loader. For `ASSESSMENT_NOT_ACTIVE`, retain form state and expose a retry that reloads the result resource.

- [x] **Step 5: Run result-screen regression tests**

Run: `npm.cmd --workspace @safealert/mobile exec vitest run src/features/dashboards/officer/screens/RiskAssessmentResultScreen.test.tsx`

Expected: PASS; Phase 1 history and Phase 2 reassess navigation remain intact.

### Task 6: Assessment-list history state and warning safety

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.test.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/CreateWarningScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/warningScreens.test.tsx`
- Modify: `apps/api/src/modules/warnings/services/warning.service.ts`
- Test: `apps/api/src/modules/warnings/tests/warning.integration.test.ts`

**Interfaces:**
- Reuse `getRiskAssessmentHistory(incidentId, accessToken)` only when the active-assessment lookup has no assessment.
- List row with history must display the latest historical status/risk and navigate to that assessment’s result/history; it must not display ASSESS INCIDENT. History lookup errors remain unknown and must not enable creation.
- Warning service and Create Warning screen require an ACTIVE assessment in addition to existing HIGH/CRITICAL eligibility.

- [x] **Step 1: Write failing list and warning tests**

Test never-assessed incident retains its create action; no-active-with-history shows latest status/risk and a history view action but no create action; failed history lookup shows a retryable error and no create action. Test CLOSED HIGH/CRITICAL assessment is rejected by warning service and blocked by Create Warning UI while ACTIVE HIGH/CRITICAL behavior remains unchanged.

- [x] **Step 2: Run list and warning tests and confirm failure**

Run: `npm.cmd --workspace @safealert/mobile exec vitest run src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.test.tsx src/features/dashboards/officer/screens/warningScreens.test.tsx`

Run: `npm.cmd --workspace @safealert/api exec vitest run src/modules/warnings/tests/warning.integration.test.ts`

Expected: FAIL because the list currently equates no active record with never assessed and warning creation does not check status.

- [x] **Step 3: Add history fallback to incident list without changing API semantics**

When active lookup returns null, request history and use the newest result if present. Display its current persisted status and risk with a view/history action. Preserve “Not assessed” only for empty history. On history failure, present the existing row-level error/refresh behavior and suppress assessment creation.

- [x] **Step 4: Enforce ACTIVE warning eligibility in service and mobile screen**

In `WarningService.create`, reject a non-ACTIVE assessment with a 409 domain error before attachment validation or warning persistence. In `CreateWarningScreen`, hide/disable form submission for non-ACTIVE assessments; preserve the existing HIGH/CRITICAL check for ACTIVE records. Do not alter attachment upload or publish behavior.

- [x] **Step 5: Run list and warning tests**

Run the same mobile list/warning screen tests and API warning integration test.

Expected: PASS, including warning regression behavior for active HIGH/CRITICAL assessments.

### Task 7: Full verification and final review

**Files:**
- Review all files changed by Tasks 1–6.

- [x] **Step 1: Run full API and warning tests**

Run: `npm.cmd --workspace @safealert/api exec -- vitest run --exclude 'dist/**'`

Expected: all Phase 3 and relevant existing tests pass; report unrelated pre-existing failures without changing those tests.

- [x] **Step 2: Run focused officer mobile tests**

Run the risk-assessment API, helper/workflow, result-screen, officer-list, and Create Warning screen test files using `npm.cmd --workspace @safealert/mobile exec vitest run ...`.

Expected: all focused tests pass.

- [x] **Step 3: Run workspace typecheck, lint, and build**

Run: `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build`.

Expected: commands complete; explain pre-existing or environment-specific failures.

- [x] **Step 4: Review diff and confirm scope**

Run `git diff --check`, inspect `git diff --stat` and the complete diff, and confirm no deployment/index/dependency changes or unrelated edits. Leave commits to the user.
