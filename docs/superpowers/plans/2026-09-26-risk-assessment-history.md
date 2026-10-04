# Risk Assessment History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only incident risk-assessment history endpoint and display its results independently on the saved assessment screen.

**Architecture:** Share the response type through `@safealert/contracts`. Add a distinct repository history query while retaining the existing active-assessment query, confirm incident existence in the service, and put the new handler behind the existing officer router middleware. Load history as independent screen state after the saved assessment identifies its incident.

**Tech Stack:** TypeScript, Express, Zod, Mongoose, Vitest, Supertest, React Native, Expo Router.

**Spec:** `docs/superpowers/specs/2026-09-26-risk-assessment-history-design.md`

## Global Constraints

- Preserve the one-ACTIVE-assessment-per-incident partial unique index and all create/calculation behavior.
- Keep risk-assessment routes protected by authentication and `DISASTER_OFFICER` authorization.
- Use shared contracts, existing repositories, and the mobile central API client.
- History is read-only and returns ACTIVE, CLOSED, and VOID records.
- Do not implement reassessment, edit, close, void, delete, monitoring, or warning lifecycle changes.
- Keep Expo SDK and all mobile dependencies unchanged.

## Review Focus

- Incident exists but is closed or its evidence is no longer verified: history still reads; pin in Task 2 service/API tests.
- Nonexistent incident: return existing 404; pin in Task 2 API integration test.
- Equal `assessedAt` values: stable ID-descending tie-break; pin in Task 1 adapter tests.
- History request failure while saved result loaded: retain result and expose retry; pin in Task 4 screen test.
- `incident/:incidentId/history` route matching: reaches history handler, not the parameterized ID handler; pin in Task 2 API test.

---

### Task 1: Shared response and repository history query

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/riskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/mongooseRiskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/repositories/inMemoryRiskAssessment.repository.ts`
- Modify: `apps/api/src/modules/risk-assessments/tests/riskAssessment.model.test.ts`
- Create: `apps/api/src/modules/risk-assessments/tests/riskAssessment.repository.test.ts`

**Interfaces:**
- Produces `RiskAssessmentHistoryResponse = { incidentId: string; assessments: SafeRiskAssessment[] }`.
- Produces `RiskAssessmentRepository.findHistoryByIncidentId(incidentId: string): Promise<SafeRiskAssessment[]>`.
- Leaves `findActiveByIncidentId` behavior unchanged.

- [ ] **Step 1: Write failing adapter tests.** In `riskAssessment.repository.test.ts`, seed assessments from multiple incidents across ACTIVE/CLOSED/VOID and assert only the requested incident is returned, all statuses are included, results sort by `assessedAt` descending then `id` descending, and no matches return `[]`.
- [ ] **Step 2: Run the repository test and confirm it fails because the history query is missing.** Run `npm --workspace @safealert/api test -- src/modules/risk-assessments/tests/riskAssessment.repository.test.ts`.
- [ ] **Step 3: Add the shared response type and repository signature; implement the in-memory filter and sort.** Use cloned safe values and preserve the active-only lookup.
- [ ] **Step 4: Add a Mongoose repository test.** Stub `RiskAssessmentModel.find` with a typed query double and assert filter `{ incidentId }`, `.sort({ assessedAt: -1, _id: -1 })`, execution, and safe serialized return values.
- [ ] **Step 5: Run both focused tests and confirm they pass.** Run `npm --workspace @safealert/api test -- src/modules/risk-assessments/tests/riskAssessment.repository.test.ts src/modules/risk-assessments/tests/riskAssessment.model.test.ts`.
- [ ] **Step 6: Implement the Mongo query using `find({ incidentId }).sort({ assessedAt: -1, _id: -1 }).exec()` and map each document through `toSafeRiskAssessment`.**
- [ ] **Step 7: Re-run both focused tests and the contracts typecheck.** Run `npm --workspace @safealert/api test -- src/modules/risk-assessments/tests/riskAssessment.repository.test.ts src/modules/risk-assessments/tests/riskAssessment.model.test.ts` and `npm --workspace @safealert/contracts run typecheck`.

### Task 2: Service, controller, protected route, and API coverage

**Files:**
- Modify: `apps/api/src/modules/risk-assessments/services/riskAssessment.service.ts`
- Modify: `apps/api/src/modules/risk-assessments/controllers/riskAssessment.controller.ts`
- Modify: `apps/api/src/modules/risk-assessments/routes/riskAssessment.routes.ts`
- Modify: `apps/api/src/modules/risk-assessments/tests/riskAssessment.integration.test.ts`

**Interfaces:**
- Produces `RiskAssessmentService.getHistoryForIncident(incidentId: string): Promise<RiskAssessmentHistoryResponse>`.
- Controller validates with existing `riskAssessmentIdSchema` and returns the service response.
- Route is `GET /incident/:incidentId/history`, declared before parameterized routes and protected by existing router middleware.

- [ ] **Step 1: Add failing integration cases** for anonymous access (401), each non-officer role (403), malformed incident ID (400), missing incident (404), closed incident history with all statuses, empty history (`{ incidentId, assessments: [] }`), and history route matching. Add the new path to existing protected-route role tables.
- [ ] **Step 2: Run the focused integration file and confirm the new cases fail because the route is absent.** Run `npm --workspace @safealert/api test -- src/modules/risk-assessments/tests/riskAssessment.integration.test.ts`.
- [ ] **Step 3: Implement `getHistoryForIncident`.** Look up the incident by ID, throw existing `INCIDENT_NOT_FOUND` on absence, then return all repository history without checking incident status or reports.
- [ ] **Step 4: Add a thin controller handler and declare the static route before `/incident/:incidentId` and `/:assessmentId`.** Reuse the router-wide auth and role guards.
- [ ] **Step 5: Re-run the integration file and confirm all new cases and existing create/calculate/get/uniqueness regressions pass.**

### Task 3: Mobile history API adapter

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.test.ts`

**Interfaces:**
- Produces `getRiskAssessmentHistory(incidentId: string, accessToken: string): Promise<RiskAssessmentHistoryResponse>`.

- [ ] **Step 1: Add a failing API adapter test** asserting encoded incident ID, history path, GET method, and bearer token.
- [ ] **Step 2: Run the focused mobile API test and confirm it fails because the function is missing.** Run `npm --workspace @safealert/api test -- --root ../.. apps/mobile/src/features/dashboards/officer/api/riskAssessmentApi.test.ts` from the repo root so Vitest resolves the mobile test from the monorepo root.
- [ ] **Step 3: Implement the adapter with the shared response type and `apiRequest`.**
- [ ] **Step 4: Re-run the adapter test and confirm existing API methods still pass.**

### Task 4: Independent history section on saved result screen

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.tsx`
- Create: `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.test.tsx`

**Interfaces:**
- Screen uses independent history loading/error/data/retry state after primary result data supplies `incidentId`.
- The history section displays status, risk, score, assessed date, and assessor ID or the current officer name on ID match.

- [ ] **Step 1: Add failing result-screen tests** for history loading, populated history including “Current” for ACTIVE and visible CLOSED/VOID statuses, successful empty state, error with Retry while primary assessment remains visible, and retry invoking another history request.
- [ ] **Step 2: Run the focused screen test and confirm failure due to the missing history section.** Use the repo's existing Vitest/React Native test setup.
- [ ] **Step 3: Add independent history loading and retry state.** Keep the primary result loader and all existing warning/factor/evidence/navigation content intact. Do not convert request errors into an empty collection.
- [ ] **Step 4: Render the history card using existing assessment card/detail/button styles and an inline loading indicator.** Keep strings specified by the design and show only contract-provided values. In the screen test, control the history hook state and assert Retry invokes its reload callback; the adapter test pins the retried request's endpoint and auth behavior.
- [ ] **Step 5: Re-run the focused screen test and confirm primary assessment content stays rendered for history loading and failure.**

### Task 5: Full verification and change review

**Files:**
- Review all files changed in Tasks 1–4.

- [ ] **Step 1: Run the focused API tests, focused mobile tests with `npm --workspace @safealert/api test -- --root ../.. <mobile-test-path>`, then the full API Vitest suite.** Record any unrelated baseline failures by name.
- [ ] **Step 2: Run monorepo typecheck, lint, and build scripts.** Fix failures introduced by this change and report any pre-existing failures.
- [ ] **Step 3: Review `git diff --check`, `git diff --stat`, and the complete diff** for out-of-scope changes, accidental formatting, security regressions, and any change to create flow or uniqueness enforcement.
- [ ] **Step 4: Report final endpoint/response, RBAC, adapter sorting, UI behavior, changed files, tests and commands, results, assumptions, and manual verification steps.**
