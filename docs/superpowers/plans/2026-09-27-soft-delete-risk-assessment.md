# Soft Delete Risk Assessments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Soft delete closed risk assessments with an audit trail, consistent filtering from normal reads, and an officer-facing delete flow.

**Architecture:** Keep the operational status unchanged and implement deletion as a conditional repository state transition. Share reason/request/response types in contracts, enforce input rules in Zod and the model, expose an officer-only PATCH endpoint, and add a closed-only form to the existing result screen.

**Tech Stack:** TypeScript, Express, Zod, Mongoose, Vitest, React Native, Expo Router, shared `@safealert/contracts`.

**Spec:** `docs/superpowers/specs/2026-09-27-soft-delete-risk-assessment-design.md`

## Global Constraints

- Use strict TypeScript; do not add `any`, unsafe casts, dependencies, or hard-coded API URLs.
- Do not physically delete documents or introduce a `DELETED` status, restore flow, Void workflow, Monitoring, or unrelated refactoring.
- Only `CLOSED` assessments can be soft deleted; preserve the ACTIVE partial unique index and existing lifecycle transitions.
- Missing `isDeleted` on legacy records is equivalent to false.
- Keep role authorization on the backend and store mobile tokens through the existing auth/API client.
- Keep Expo SDK and native dependencies unchanged.

## Review Focus

- Legacy document with no `isDeleted` stays readable; `isDeleted: true` is hidden. Pin in Task 2 repository tests.
- A VOID or ACTIVE record cannot be deleted, including during concurrent lifecycle changes. Pin in Task 2 and Task 3 tests.
- An `OTHER` reason with missing, blank, too short, or too long note is rejected; pin in Task 1 schema tests.
- A stale or repeated delete maps to 409 while a missing ID maps to 404; pin in Task 3 integration tests.
- Deleting an earlier reassessment never changes its successor's `previousAssessmentId` or the current ACTIVE card. Pin in Task 3 persistence/API and Task 5 mobile tests.

---

### Task 1: Shared contracts, request validation, and model fields

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/modules/risk-assessments/validation/riskAssessment.schemas.ts`
- Modify: `apps/api/src/modules/risk-assessments/models/riskAssessment.model.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.schemas.test.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.model.test.ts`

**Interfaces:**
- Produce `RISK_ASSESSMENT_DELETE_REASONS`, `RiskAssessmentDeleteReason`, `DeleteRiskAssessmentRequest`, and `DeleteRiskAssessmentResponse` in shared contracts.
- Extend `SafeRiskAssessment` with required `isDeleted: boolean` and optional `deletedAt`, `deletedById`, `deleteReason`, and `deleteNote`.
- Export `deleteRiskAssessmentSchema`: strict object with `deleteReason` and optional trimmed `deleteNote`, 10-500 characters, requiring a note for `OTHER`.

- [x] Add schema tests for each allowed reason, invalid/forged fields, note trimming and bounds, and blank/missing `OTHER` notes; run the focused schema test and confirm the new cases fail.
- [x] Add model tests for the false default, enum validation, serialization of optional audit fields, and legacy records without the field; run focused model tests and confirm failures.
- [x] Implement the shared types, Zod schema, Mongoose fields/default, and serialization. Serialize a missing legacy flag as false. Add model validation requiring deletion date, officer, and reason when deleted, plus an `OTHER` note; exclude deletion fields from create/reassessment inputs in Task 2.
- [x] Run `npm --workspace @safealert/api test -- src/modules/risk-assessments/tests/riskAssessment.schemas.test.ts src/modules/risk-assessments/tests/riskAssessment.model.test.ts` and confirm the focused tests pass.

### Task 2: Atomic repository transition and normal-read filtering

**Files:**
- Modify: `apps/api/src/modules/risk-assessments/repositories/riskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/inMemoryRiskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/mongooseRiskAssessment.repository.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.repository.test.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.persistence.test.ts`

**Interfaces:**
- Add `SoftDeleteClosedAssessmentInput` containing only `deletedAt`, `deletedById`, `deleteReason`, and optional `deleteNote`.
- Add repository result union `deleted | not_found | not_closed | already_deleted` and `softDeleteClosedAssessment(assessmentId, input)`.
- Make repository create inputs omit all deletion audit fields; new records get `isDeleted: false` in both implementations.

- [x] Add in-memory tests for successful CLOSED deletion and audit values; ACTIVE/VOID refusal; duplicate and simultaneous delete behavior; normal ID, active, and history filtering; and unchanged successor linkage. Run focused repository tests and confirm failure.
- [x] Add Mongoose persistence tests for legacy missing-field visibility, atomic CLOSED-only transition, concurrent calls yielding one success, query filtering, and retained document count/ID/linkage. These follow the existing `RISK_ASSESSMENT_TEST_MONGODB_URI` skip convention. Run the focused persistence test and confirm failure where MongoDB is configured.
- [x] Implement the focused atomic update using `_id`, `status: 'CLOSED'`, and `isDeleted != true` semantics, setting only audit fields and `isDeleted`. On no match, inspect stored state internally to return the correct result union; never call a physical delete API.
- [x] Apply `isDeleted: { $ne: true }` filtering to normal Mongoose ID/active/history reads and equivalent in-memory filtering; preserve legacy missing values and newest-first sort. Keep reassessment references unchanged.
- [x] Run both focused repository and persistence test files; confirm the in-memory suite passes and report if Mongo integration cases skip because no test URI is configured.

### Task 3: Service, controller, route, and API regression coverage

**Files:**
- Modify: `apps/api/src/modules/risk-assessments/services/riskAssessment.service.ts`
- Modify: `apps/api/src/modules/risk-assessments/controllers/riskAssessment.controller.ts`
- Modify: `apps/api/src/modules/risk-assessments/routes/riskAssessment.routes.ts`
- Test: `apps/api/src/modules/risk-assessments/tests/riskAssessment.integration.test.ts`
- Test: `apps/api/src/modules/warnings/tests/warning.integration.test.ts`

**Interfaces:**
- Add `RiskAssessmentService.softDelete(officerId, assessmentId, input): Promise<DeleteRiskAssessmentResponse>`.
- Add controller handler `softDelete` and route `PATCH /:assessmentId/delete` under the existing router authentication and officer-role middleware.
- Use 404 for absent assessments; use 409 for ACTIVE, VOID/ineligible, already-deleted, and stale/concurrent states. Return the updated assessment from a successful transition.

- [x] Add integration tests for authentication/role, malformed ID, strict request body, server-owned identity/timestamp, successful CLOSED deletion, OTHER note validation, ACTIVE/VOID rejection, repeated-delete conflict, missing record 404, direct-ID/history filtering, and incident lookup. Include assertions that storage retains the same record and an ACTIVE successor remains current. Add a warning regression proving an ACTIVE assessment still supports warning creation after an older CLOSED record is deleted. Run focused tests and confirm new assertions fail.
- [x] Implement `softDelete` by calling the conditional repository transition directly and mapping its result union to 404/409 errors; do not pre-read via filtered `findById`, so repeat deletion remains a 409. Pass only the authenticated officer ID and server timestamp to persistence.
- [x] Register the PATCH route and controller, retaining the shared auth and `DISASTER_OFFICER` middleware.
- [x] Run `npm --workspace @safealert/api test -- src/modules/risk-assessments/tests/riskAssessment.integration.test.ts` and confirm existing create, calculate, view, history, reassessment, close, and warning regressions still pass.

### Task 4: Mobile API and delete request builder

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/riskAssessmentForm.ts`
- Test: `apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.test.ts`
- Test: `apps/mobile/src/features/dashboards/officer/riskAssessmentForm.test.ts`

**Interfaces:**
- Add `softDeleteRiskAssessment(assessmentId, input, accessToken): Promise<DeleteRiskAssessmentResponse>` calling the relative `/risk-assessments/:id/delete` path with PATCH.
- Add `buildDeleteRiskAssessmentRequest(reason, note)` returning the shared request type, with client-side trim and the same `OTHER` note validation.

- [x] Add API helper tests for the PATCH method, encoded assessment ID, request body, auth token, and response; add builder tests for trimming, optional predefined-reason note, and required `OTHER` note. Run focused mobile tests and confirm failures.
- [x] Implement the helper and builder through existing API client and error conventions.
- [x] Run `npm exec -- vitest run apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.test.ts apps/mobile/src/features/dashboards/officer/riskAssessmentForm.test.ts` and confirm they pass.

### Task 5: Closed-only result UI and end-to-end verification

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.tsx` (only for the neutral empty-state label)
- Test: `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.test.tsx`
- Test: `apps/mobile/src/features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.test.tsx`

**Interfaces:**
- Add closed-only Delete Assessment action and a cancellable form using existing `AssessmentOptions`, `TextInput`, button, error, and loading patterns.
- On success, return to `/officer/assessments` with a fresh refresh token; on failure, retain the result and show the error. Active cards and actions remain unchanged.

- [x] Add screen tests that ACTIVE records have no delete action; CLOSED records open the form; `OTHER` requires a note; cancel and invalid input make no request; duplicate submit is blocked; failure keeps the screen visible; success navigates and refreshes. Add list coverage that a remaining ACTIVE assessment is still displayed and that no visible assessment history uses the neutral `No current assessment` state. Run focused screen tests and confirm new cases fail.
- [x] Implement the form and submission guard in the result screen, reusing the request builder and API helper. Preserve close, reassess, history, and warning behavior. When the filtered history is empty, change the current `Not assessed` label to `No current assessment` so a soft-deleted, manually closed record is not presented as never assessed; keep existing assess action and lifecycle behavior.
- [x] Run `npm exec -- vitest run apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.test.tsx apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.test.ts apps/mobile/src/features/dashboards/officer/riskAssessmentForm.test.ts` and `npm --workspace @safealert/api test`.
- [x] Run `npm exec -- vitest run apps/mobile/src/features/dashboards/officer` to cover the remaining officer mobile regressions.
- [x] Run `npm run typecheck`, `npm run lint`, and `npm run build`; resolve introduced failures and report any pre-existing failures.
- [x] Review `git diff --check` and the complete diff for unrelated edits, physical deletion calls, forged client audit fields, unchanged ACTIVE unique index, and correct read filters.


