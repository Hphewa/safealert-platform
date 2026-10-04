# SafeAlert Risk Assessment UX Phases 7â€“10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: After the execution approach is selected, use `superpowers:executing-plans` for inline execution or `superpowers:subagent-driven-development` for delegated execution. Steps use checkbox (`- [x]`) syntax for tracking. The active sandbox exposes `.git` read-only, so linked worktrees and commits are unavailable in the writable scope.

**Goal:** Complete the officer reassessment, risk explanation, operational timeline, draft recovery, accessibility, and cross-screen consistency work for Phases 7â€“10.

**Architecture:** Keep reassessment and initial assessment on typed routes backed by the existing draft provider and shared factor sections. Extend the existing server scoring function to produce and persist versioned contribution snapshots, and aggregate incident activity from existing repositories inside the officer-protected incident lifecycle API. Persist only user-scoped editable drafts in AsyncStorage; do not restore calculations. Harden existing shared officer UI components without changing resident flows or backend business rules.

**Tech Stack:** TypeScript, Expo Router / Expo Go SDK 57, React Native, React Context, `expo-symbols`, `@react-native-async-storage/async-storage`, Express, Mongoose, `@safealert/contracts`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-risk-assessment-ux-phases-7-10-design.md`

## Global Constraints

- Preserve report verification, incident grouping, authentication/RBAC, warning publication, uniqueness, backend validation, and transactional reassessment behavior.
- The backend remains the only authority that calculates risk. Calculation, create, and reassess continue to invoke the same server scoring function.
- Do not invent point contributions, timeline events, location names, incident closure, user identities, or friendly reference numbers.
- Do not introduce a state-management framework or change resident workflows except where a shared component requires it.
- Do not remove duplicate-submit guards, the one-active-assessment index, or server transaction protections.
- Keep Expo Go SDK 57 compatibility and do not upgrade or downgrade Expo, React, React Native, Expo Router, or native modules.
- Do not store credentials or tokens with assessment drafts. Do not persist a calculation preview as current.
- Keep â€œClose Assessmentâ€ semantics; do not implement incident closure.
- Maintain readable text alongside color for risk and status, and keep Assessment History distinct from Incident Activity.
- Use four strict phase checkpoints. Stop before the next phase if a checkpoint adds an unexplained failure.
- Fresh full-suite baseline: 2,147 passed, 33 skipped, 9 failed assertions; exact failures are recorded in `$env:TEMP/safealert-phase7-10-baseline.json`.
- Fresh focused baseline: 297 passed, 3 failed across 16 files. All three focused failures are RiskAssessmentResult saved-assessment heading assertions: they expect a middle dot but the rendered value contains a replacement glyph.

## Review Focus

- A stale reassessment route or completed request must not replace the active assessment or save against another incident; Phase 7 stale-route and reassessment conflict tests.
- Contribution points must sum to the server score, and non-FLOOD water must not be represented as scoring input; Phase 8 exhaustive factor and hazard tests.
- Reassessment must create an activity event without a duplicate REASSESSED closure event; Phase 8 timeline projection tests.
- A slow storage write or user switch must not restore another officerâ€™s or an older version of the draft; Phase 9 ordered-write, user-scope, and hydration tests.
- A dirty route exit must not bypass discard confirmation, while step-to-step back remains uninterrupted; Phase 9 navigation guard tests.

---

### Task 1: Phase 7 reassessment wizard and checkpoint

**Files:**
- Create: `apps/mobile/app/officer/assessments/reassess/[step].tsx`
- Create: `apps/mobile/src/features/dashboards/officer/screens/ReassessmentWizardScreen.tsx` and `.test.tsx`
- Create: `apps/mobile/src/features/dashboards/officer/components/AssessmentFactorFields.tsx`
- Create: `apps/mobile/src/features/dashboards/officer/assessment-flow/assessmentFactorChanges.ts` and `.test.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/InitialAssessmentWizardScreen.tsx` and `.test.tsx` to consume shared factor fields without changing initial behavior
- Modify: `apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.tsx` and `.test.tsx` to preserve the old route as a redirect for initial and reassessment entry
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.tsx` and `.test.tsx` and `RiskAssessmentResultScreen.tsx` and `.test.tsx` to enter the new reassessment route
- Modify: `apps/mobile/src/features/dashboards/officer/assessment-flow/riskAssessmentDraftState.ts`, `.test.ts`, and `riskAssessmentDraft.tsx` for a separate previous-assessment snapshot and new editable factors
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.tsx` and `.test.tsx` for the â€œAssessment updatedâ€ one-time notice

**Interfaces:**
- `AssessmentFactorFields` consumes `RiskAssessmentForm`, current field errors/touch state, incident hazard type, and a typed factor-change callback; it renders the existing Situation, Impact & Access, and Environment controls.
- `assessmentFactorChanges(previous: RiskAssessmentFactors, next: RiskAssessmentFactors)` returns only changed keys with typed old/new values and numeric delta for population counts.
- `ReassessmentWizardScreen` consumes only `assessmentId` and `step` route params, loads the existing assessment and monitoring detail APIs, and uses the shared provider for editable values.
- `RiskAssessmentDraft` keeps `previousAssessment` separate from `factors`, plus the existing preview, decision fields, and required text reassessment reason.
- Save continues to call `reassessRiskAssessment(assessmentId, existingRequest, accessToken)`.

- [x] **Step 1: Write failing factor-comparison and reassessment-flow tests.** Cover prefilled current values without object mutation; UX prompts and 10â€“500-character reason validation without premature errors; positive/zero new evidence; changed, unchanged, and numeric factor comparisons; review before calculate; calculate only through the existing API; preview invalidation; previous/new risk levels without causal claims; matching decision notes and override reason; separate reassessment and decision reasons in the existing request; conflict retains draft; success routes to Monitoring with a one-time update notice; back navigation; and unchanged initial wizard behavior.
- [x] **Step 2: Run the new tests and verify RED.** Run new reassessment screen and factor-comparison tests with existing reassessment, draft, initial wizard, Monitoring detail, RiskDecision, and RiskAssessmentResult tests. New behavior tests should fail before implementation; the three focused RiskAssessmentResult baseline failures must remain identifiable.
- [x] **Step 3: Extract and reuse the Phase 4 factor sections.** Implement `AssessmentFactorFields` and replace duplicated initial wizard factor markup while preserving values, validation, keyboard behavior, labels, and route behavior. Run initial wizard and field tests.
- [x] **Step 4: Implement typed reassessment steps and change review.** Add Reason & Evidence, Update Situation, Update Impact & Environment, Review Changes, Comparison, and Decision stages. Keep the previous assessment immutable and shared draft editable; calculate through the existing API; clear stale preview on any factor edit; retain stale-request generation guards.
- [x] **Step 5: Route existing reassessment entry and save success.** Route Monitoring and assessment details to the new step route; redirect the legacy reassessment URL; save only via the existing transactional endpoint; on success reset draft and replace to Monitoring with temporary â€œAssessment updatedâ€ feedback.
- [x] **Step 6: Run the Phase 7 checkpoint.** Run reassessment, initial wizard, draft, Monitoring, warning, and decision tests; API and mobile typecheck; API and mobile lint. Compare exact failing assertions/files to the fresh baseline. Continue only if no new unexplained failure exists.

### Task 2: Phase 8 authoritative contributions and incident timeline

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/modules/risk-assessments/services/riskCalculation.service.ts`, `riskAssessment.service.ts`, and `models/riskAssessment.model.ts`
- Modify: `apps/api/src/modules/risk-assessments/tests/riskCalculation.service.test.ts`, `riskAssessment.model.test.ts`, and `riskAssessment.integration.test.ts`
- Create: `apps/api/src/modules/incidents/services/incidentActivityTimeline.ts` and `.test.ts`
- Modify: `apps/api/src/modules/incidents/services/incidentLifecycle.service.ts`, `controllers/incident.controller.ts`, `routes/incident.routes.ts`, and `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/incidents/tests/incidentLifecycle.service.test.ts` and `incident.integration.test.ts`
- Create: `apps/mobile/src/features/dashboards/officer/api/incidentActivityApi.ts` and `.test.ts`
- Create: `apps/mobile/src/features/dashboards/officer/components/IncidentActivityTimeline.tsx` and `.test.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/components/RiskRecommendation.tsx` and the Recommendation stage in `InitialAssessmentWizardScreen.tsx` and tests
- Modify: `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.tsx` and `.test.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.tsx` and `.test.tsx`

**Interfaces:**
- `RiskFactorContribution` is a shared union keyed by `keyof RiskAssessmentFactors`, with `label`, factor-typed `selectedValue`, and authoritative `points`.
- `CalculateRiskAssessmentResponse` adds `factorContributions` and `calculationVersion` to `calculatedScore` and `systemSuggestedRisk`.
- `SafeRiskAssessment` has optional `factorContributions` and `calculationVersion` for old-record compatibility.
- `RiskActivityEvent` is a discriminated union with event `id`, `type`, ISO timestamp, title, optional description, and optional `relatedRecordId`; `IncidentActivityTimelineResponse` contains incident ID and newest-first events.
- `IncidentLifecycleService.getTimeline(incidentId)` composes from existing Incident, Report, RiskAssessment, and Warning repositories and throws existing `ApiError` for missing incidents.

- [x] **Step 1: Write failing contribution and snapshot tests.** Pin every factor bucket, all risk thresholds, contribution sum equals total, FLOOD includes water points used, non-FLOOD omits water contribution, and calculate/create/reassess use the same scoring function. Test new persisted/safe records return contribution version/snapshot and old records omit it cleanly.
- [x] **Step 2: Run calculation/model tests and verify RED.** Run selected calculation, model, and API workflow tests. New breakdown/version assertions should fail while existing baseline RiskAssessmentResult failures remain unchanged.
- [x] **Step 3: Implement shared contribution and version types.** Add strict factor-key/value typing and `RISK_CALCULATION_VERSION = 'risk-v1'`; refactor `calculateRisk` to construct contributions once and derive score from their sum. Return breakdown only from the server response.
- [x] **Step 4: Persist authoritative snapshots on create and reassess.** Add optional Mongoose fields and safe serialization. Compute contributions again within server create/reassess and store them with the version; do not accept client breakdown fields. Preserve active uniqueness and reassessment transaction unchanged.
- [x] **Step 5: Write failing timeline projection/API tests.** Cover incident and report creation, verification-history and legacy verifiedAt fallback, assessment creation, reassessment with one event and saved old/new decisions, manual close, warning draft creation/publication, newest-first stable ordering, unsupported/deleted/missing events omitted, incident not found, and officer RBAC.
- [x] **Step 6: Run timeline tests and verify RED.** Run incident activity unit and incident integration tests. New route/projection assertions should fail before implementation.
- [x] **Step 7: Implement activity aggregation using existing repositories.** Add endpoint before `/:incidentId`, preserve officer middleware, and compose only persisted timestamped records. Add no model, event writes, or incident lifecycle changes.
- [x] **Step 8: Write failing mobile explanation/timeline tests.** Cover recommendation shows server-provided entries and total only, saved breakdown expansion/legacy unavailable state, timeline event descriptions and order, empty state, reassessment, warning draft/published, and related navigation without visible raw IDs.
- [x] **Step 9: Implement mobile API/UI.** Render breakdown secondary to risk and score. Keep timeline separate from Assessment History and use saved final risk values without causal statements.
- [x] **Step 10: Run the Phase 8 checkpoint.** Run risk calculation/API/model/transaction tests, incident timeline/integration tests, mobile breakdown/timeline/initial/reassessment/Monitoring tests, and warning workflows; API and mobile typechecks; API and mobile lint. Compare failures with baseline and Phase 7. Continue only if stable.

### Task 3: Phase 9 draft persistence, recovery, discard guard, accessibility checkpoint

**Files:**
- Modify: `apps/mobile/package.json` and `package-lock.json` using `npx expo install @react-native-async-storage/async-storage`
- Create: `apps/mobile/src/features/dashboards/officer/assessment-flow/riskAssessmentDraftStorage.ts` and `.test.ts`
- Modify: `apps/mobile/src/features/dashboards/officer/assessment-flow/riskAssessmentDraft.tsx`, `riskAssessmentDraftState.ts`, and tests
- Create: `apps/mobile/src/features/dashboards/officer/components/AssessmentDraftRecovery.tsx` and `.test.tsx`
- Create: `apps/mobile/src/features/dashboards/officer/hooks/useAssessmentDraftExitGuard.ts` and `.test.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/InitialAssessmentWizardScreen.tsx`, `.test.tsx`, `ReassessmentWizardScreen.tsx`, `.test.tsx`, and assessment route layouts as needed for dirty-exit prevention
- Create or modify: shared small loading/error/success components under `apps/mobile/src/features/dashboards/officer/components/` with focused tests
- Modify: `apps/mobile/src/features/auth/context/AuthContext.tsx` or draft provider logout boundary only if required to clear the current userâ€™s draft

**Interfaces:**
- Storage exposes `readDraft(userId)`, `writeDraft(userId, draft)`, and `clearDraft(userId)` over a schema-versioned user key; it serializes mutations so stale writes cannot win.
- Rehydrated drafts contain editable values and update time only; preview is always null and is recalculated after eligibility checks.
- Provider exposes hydration/recovery state and actions to continue, start again, keep editing, discard, and reset without treating a screen unmount as discard.
- User key is `safealert:assessment-draft:v1:${userId}` using `SafeUser.id`; no auth token is stored. Hydration waits until authentication has resolved, clears old-user in-memory state on account change, and only reads the current userâ€™s key.
- Exit guard listens to Expo Routerâ€™s current stack `beforeRemove` event, prevents removal for dirty drafts, and allows same-route step parameter changes without a discard prompt.

- [x] **Step 1: Write failing storage/provider tests.** Cover user-scoped key separation, round-trip fields, unsupported/corrupt data rejection, previews cleared on restore, later writes winning when earlier writes resolve slowly, storage exceptions not crashing, logout cleanup, successful-save cleanup, explicit Start Again, and draft surviving provider/screen unmount.
- [x] **Step 2: Run storage tests and verify RED.** Run storage, draft reducer/provider, wizard, reassessment, and auth tests. New persistence/recovery assertions should fail before implementation.
- [x] **Step 3: Install the storage dependency with Expo tooling.** Run `npx expo install @react-native-async-storage/async-storage`; keep SecureStore unchanged for tokens. Verify SDK 57 compatibility and that lockfile changes stay limited to this package.
- [x] **Step 4: Implement schema-versioned user-scoped storage and provider hydration.** Persist only a nonblank editable draft. Strip calculation preview when serializing or hydrating. Serialize writes and safely handle malformed payload/storage failure.
- [x] **Step 5: Implement Continue/Start Again with server revalidation.** Before restoring initial state, revalidate through the existing queue/overview eligibility path. Before restoring reassessment, fetch the assessment and require the same active ID/status. A stale draft offers current Overview/Monitoring and clears invalid data.
- [x] **Step 6: Implement dirty-exit guard and cleanup rules.** Add Keep Editing/Discard confirmation only when leaving a dirty assessment subtree; keep same-route wizard step navigation free of confirmation. Clear persisted draft on success, Start Again, discard, and logout. Confirm restart retains a usable draft.
- [x] **Step 7: Implement accessible loading/error/success states.** Add light skeleton/activity states with labels, consistent retryable errors, and compact one-time save notices. Recoverable errors keep form input. Add label/role/selected/expanded/alert semantics and keyboard avoidance for reason, notes, and override inputs.
- [x] **Step 8: Run the Phase 9 checkpoint.** Run persistence/recovery/guard tests plus all initial/reassessment/draft/Monitoring/warning tests; API and mobile typecheck; API and mobile lint; `npx expo install --check`. Compare against baseline and Phases 7â€“8. Continue only if stable.

### Task 4: Phase 10 consistency, hardening, final report, and checkpoint

**Files:**
- Promote existing transitive Expo Symbols to a direct mobile dependency with `npx expo install expo-symbols`; modify `apps/mobile/package.json` and `package-lock.json`
- Modify: `apps/mobile/src/features/dashboards/shared/components/BottomNavigation.tsx`, `DashboardGlyph.tsx` or an officer-only icon wrapper, `apps/mobile/src/features/dashboards/shared/types.ts`, and `apps/mobile/src/features/dashboards/officer/officerNavigation.ts`
- Modify: `apps/mobile/src/features/dashboards/shared/theme.ts`, `components/PriorityBadge.tsx`, `components/StatusBadge.tsx`, and officer assessment shared components
- Create: `apps/mobile/src/features/dashboards/shared/formatOperationalTime.ts` and `.test.ts`
- Modify: officer queue, overview, wizard, reassessment, recommendation, decision, Monitoring, result/details, and history screens/tests to use shared tokens, time/location/status and omit raw IDs
- Modify relevant officer component tests for small-width/accessibility semantics and entries without IDs
- Create: `docs/development/phase-7-10-risk-assessment-ux.md`

**Interfaces:**
- Officer bottom navigation renders platform symbols for officer items, short labels `Home`, `Reports`, `Assess`, `Monitor`, `Warnings`, nested-route active state, and selected accessibility semantics. Other roles retain their existing navigation behavior.
- `formatOperationalTime(timestamp, now?)` returns `Just now`/minutes/hours ago for timestamps within 24 hours and readable exact local date/time for older timestamps; invalid values return `Time unavailable`.
- Existing `PriorityBadge`, `StatusBadge`, `HumanReadableLocation`, `AssessmentPage`, and dashboard theme remain shared sources of status, location, layout, and color semantics.

- [x] **Step 1: Write failing navigation/time/ID/accessibility tests.** Cover concise labels, active nested Assess/Monitor routes, selected state, symbol rendering and accessible button names; recent/older/invalid time; technical IDs absent from primary assessment UI; location text with coordinate fallback; status/risk labels independent of color; and long copy without fixed-width overflow.
- [x] **Step 2: Run selected UI tests and verify RED.** Run navigation, badge, time, assessment result/history, Monitoring, and location tests. New assertions should fail on letter glyphs, long labels, inconsistent timestamps, IDs, or semantics.
- [x] **Step 3: Promote Expo Symbols and update officer navigation.** Run `npx expo install expo-symbols` and use cross-platform symbols supported in SDK 57. Keep labels concise, touch targets at least 44 points, and selected state semantic. Run Expo dependency check.
- [x] **Step 4: Standardize shared typography, spacing, badges, headers, and actions.** Reuse tokens and existing components; preserve text labels and lifecycle wording. Remove raw IDs from officer primary/result/history display while keeping IDs in route/API state.
- [x] **Step 5: Standardize time, empty states, location, and responsive screens.** Apply the shared time formatter and Phase 3 location component. Fix narrow width, large text, long labels, keyboard and footer overlap. Optimize only measured large lists or duplicate requests; add no new data layer.
- [x] **Step 6: Review business/security invariants.** Verify server role middleware, factor validation, server calculation/recomputation, required override reasons, one-active-assessment DB index, reassessment transaction, warning rules, and verified-evidence requirements remain intact. Keep â€œClose Assessmentâ€; add no incident closure.
- [x] **Step 7: Write the Phase 7â€“10 Aâ€“AC change report.** Record fresh baseline, per-phase files and workflow behavior, contribution/version strategy, timeline sources/order, persistence/recovery/cleanup, accessibility, haptics omission, UI consistency, security review, validation counts, baseline-only failures, device checks, and deferred scope.
- [x] **Step 8: Run the final Phase 10 validation.** Run API/mobile typechecks and lints, focused API/mobile tests for Phases 1â€“10 and warnings, `npx expo install --check`, full `npm.cmd exec -- vitest run --maxWorkers=2`, and `git diff --check`. Compare every failed test name/file to baseline. Do not report stable with an unexplained new failure.

---

## Execution notes

- This plan implements the four requested strict checkpoints; do not start the next phase until its prior checkpoint is stable.
- The current three focused RiskAssessmentResult failures are baseline saved-assessment heading character mismatches. Do not mask them; compare exact test names and files after each phase.
- Full baseline failures include six compiled report assertions, the OfficerDashboard import-resolution suite failure, and three RiskAssessmentResult assertions. No source files associated with those failures should be changed unless an in-scope task requires it.
- Expo dependency changes must use `npx expo install` and finish with `npx expo install --check`.
- The active sandbox exposes `.git` read-only. Keep all source/report files in the authorized workspace; do not attempt to create a linked worktree or commit from this sandbox.
