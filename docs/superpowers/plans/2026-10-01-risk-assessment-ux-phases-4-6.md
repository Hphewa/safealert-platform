# SafeAlert Risk Assessment UX Phases 4–6 Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Each phase is a checkpoint; stop if it introduces unresolved failures.

**Goal:** Replace the initial assessment form with a guided wizard and separate recommendation/decision stages, then redesign officer Monitoring presentation.

**Architecture:** Keep all wizard state in the existing `RiskAssessmentDraftProvider`. Use the nested `/officer/assessments/wizard/[step]` route for initial assessment only, leaving reassessment on the current route and flow. Reuse existing risk-assessment, monitoring, history, warning, location, and dashboard layout abstractions.

**Tech Stack:** Expo Router, React Native, TypeScript, existing SafeAlert mobile APIs/contracts, Vitest, existing lint and TypeScript scripts.

**Spec:** `docs/superpowers/specs/2026-10-01-risk-assessment-ux-phases-4-6-design.md`

## Global Constraints

- No backend, contract, model, dependency, or persistent-storage changes.
- Keep Expo Go SDK 57 compatibility.
- Do not change incident grouping, risk scoring, thresholds, or warning publication behavior.
- Do not redesign reassessment; preserve all current reassessment behavior.
- Reuse shared draft state and Phase 3 `HumanReadableLocation`.
- No factor contributions, unified timeline, incident closure, raw IDs, or AsyncStorage.
- At every phase checkpoint, compare failures to the fresh baseline: 2,131 passed, 33 skipped, 12 failed.
- Baseline failures: six report integration assertions, OfficerDashboard import resolution, two MonitoringDetail expectations, one Monitoring list test, and three RiskAssessmentResult assertions.

## Review Focus

- Vulnerable count exceeds affected count: validate inline and block continuation; Phase 4 wizard tests.
- Editing factors after calculation: clear the preview and prevent stale save; Phase 5 draft/workflow tests.
- A stale/blurred request completes: do not navigate, overwrite current data, or initialize a draft; Phase 4/5 navigation tests.
- Monitoring has no ACTIVE assessment: show latest visible history or a neutral no-current-risk state; Phase 6 detail tests.
- Warning eligibility varies by risk and existing warning: recommend creation only for ACTIVE HIGH/CRITICAL without a warning; Phase 6 detail tests.

---

### Task 1: Phase 4 initial-only wizard and checkpoint

**Files:**
- Create: `apps/mobile/app/officer/assessments/wizard/[step].tsx`
- Create: `apps/mobile/src/features/dashboards/officer/components/AssessmentProgress.tsx`
- Create: `apps/mobile/src/features/dashboards/officer/screens/InitialAssessmentWizardScreen.tsx`
- Create: `apps/mobile/src/features/dashboards/officer/screens/InitialAssessmentWizardScreen.test.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/IncidentOverviewScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/IncidentOverviewScreen.test.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/CreateRiskAssessmentScreen.test.tsx`
- Reuse: `apps/mobile/src/features/dashboards/officer/assessment-flow/riskAssessmentDraft.tsx`
- Reuse: `apps/mobile/src/features/dashboards/officer/riskAssessmentForm.ts`

**Interfaces:**
- Route consumes only `incidentId` and a `step` string from Expo Router; it never carries factors.
- Wizard reads and updates factors only through the shared draft provider.
- Phase 3 Start revalidation remains authoritative and navigates to the `situation` step after it succeeds.
- Existing reassessment mode remains on `CreateRiskAssessmentScreen` and retains its current route, calculation, reason, and save behavior.

- [x] **Step 1: Add failing tests for the initial wizard route and factor grouping.** Assert Start opens Situation; Situation contains hazard severity and both population counts; Impact & Access contains road/infrastructure; Environment contains water/weather; progress reads steps 1–3; Review is read-only and links back to each step; reassessment retains its existing route.
- [x] **Step 2: Run the focused tests and verify they fail for missing wizard behavior.** Run the wizard, IncidentOverview, CreateRiskAssessment, draft, queue, and existing reassessment test files.
- [x] **Step 3: Implement the nested wizard route, shared progress component, and step screens.** Reuse existing factor enums/options and validation. Keep values in the shared provider, show inline errors only after interaction, use numeric keyboards, and reuse the existing keyboard avoidance pattern. Review validates the full draft and returns invalid input to its step without calculating.
- [x] **Step 4: Preserve Phase 3 entry, return, and reassessment behavior.** Update Start destination to Situation; keep only identifiers in navigation; ensure a different incident cannot inherit the prior draft; leave reassessment on the old flow.
- [x] **Step 5: Run the Phase 4 checkpoint.** Run wizard, draft, queue, overview, assessment navigation, and reassessment tests; mobile typecheck; mobile lint. Compare full failure identities to the recorded baseline before beginning Phase 5.

### Task 2: Phase 5 recommendation, decision, and save checkpoint

**Files:**
- Create: `apps/mobile/src/features/dashboards/officer/components/RiskRecommendation.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/InitialAssessmentWizardScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/InitialAssessmentWizardScreen.test.tsx`
- Reuse: `apps/mobile/src/features/dashboards/officer/assessment-flow/riskAssessmentDraft.tsx`
- Reuse: existing `calculateRiskAssessment`, `createRiskAssessment`, `riskAssessmentForm`, and guarded assessment resource patterns.

**Interfaces:**
- The Review step validates the complete draft and is the only initial-flow caller of the calculate API.
- Calculation stores the exact returned recommendation and factor snapshot in the shared draft.
- Recommendation and Decision steps read the preview and factor snapshot from that provider; route params contain no factor data.
- Initial save uses the existing create request and existing success route to Monitoring.

- [x] **Step 1: Add failing tests for calculate-on-Review and recommendation presentation.** Assert no earlier step calls calculate, Review submits exact factors once, the recommendation level is more prominent than score, entered factors are summarized, and no per-factor contribution is claimed.
- [x] **Step 2: Run focused tests and verify the expected failures.** Include Task 1 wizard tests and draft reducer tests.
- [x] **Step 3: Implement guarded Review calculation and the dedicated Recommendation step.** Reject invalid factors before API access; ignore obsolete or blurred completions; rely on existing reducer invalidation when factors change.
- [x] **Step 4: Add failing tests for final decision behavior and explicit save confirmation.** Cover matching recommendation with optional notes, override with required reason, factor edit invalidating preview, confirmation cancel/confirm, saving state, duplicate taps, failed save draft retention, and one-time success navigation.
- [x] **Step 5: Implement the Decision step and save confirmation using existing validation and save guards.** On success only, reset the draft and navigate to Monitoring with the temporary notice; preserve the draft on failure.
- [x] **Step 6: Run the Phase 5 checkpoint.** Run Phase 1–5 draft, wizard, calculation, decision, save, navigation, and reassessment tests; mobile typecheck; mobile lint. Compare against baseline and do not begin Phase 6 with new unresolved failures.

### Task 3: Phase 6 Monitoring list/detail and checkpoint

**Files:**
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringScreen.test.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.tsx`
- Modify: `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.test.tsx`
- Reuse: `apps/mobile/src/features/dashboards/shared/maps/HumanReadableLocation.tsx`
- Reuse: existing monitoring, risk-assessment history, and warning APIs/routes.

**Interfaces:**
- Monitoring list/detail continue consuming existing API response contracts.
- Warning creation/view, assessment detail/history, reassessment, and close continue to use existing routes and lifecycle semantics.
- Location rendering uses the Phase 3 shared component and its coordinate fallback.

- [x] **Step 1: Update list tests for compact Monitoring content and interactions.** Cover loading, error/retry, empty state, current/latest risk and status, readable location, evidence counts, new-evidence indicator, detail navigation, and pull-to-refresh.
- [x] **Step 2: Implement compact responsive Monitoring cards.** Keep risk and incident status textual as well as colored, omit technical IDs, and use existing resource reload and dashboard footer layout.
- [x] **Step 3: Update detail tests for assessment, evidence, history, warning, and action states.** Cover current risk/score/time, no-current-risk state, new-evidence zero/positive, compact recent reports, history navigation, warning none/draft/published, HIGH creation recommendation, no recommendation at lower risk, reassess/view/close wording, and temporary success notice.
- [x] **Step 4: Implement Monitoring detail sections using existing API data.** Separate current/latest assessment, situation summary, recent verified evidence, warning state, and history; do not create a unified timeline or imply draft warnings are published. Preserve existing action routes and use Close Assessment wording.
- [x] **Step 5: Run the Phase 6 checkpoint.** Run Monitoring list/detail tests, warning workflow tests, Phase 1–5 wizard/draft/assessment tests, and reassessment tests; mobile typecheck; mobile lint. Focused selection: 81 passed across 12 files; typecheck and lint passed. Full-run baseline failures were reduced from 12 to 9 with no new failed test identities.

### Task 4: Final Phase 4–6 verification and report

**Files:**
- Create: `docs/development/phase-4-6-risk-assessment-ux.md`

- [x] **Step 1: Run all requested focused mobile suites.** Include draft, queue, incident overview, wizard/recommendation/decision, Monitoring list/detail, relevant warning workflows, and reassessment. Result: 81 passed across 12 files.
- [x] **Step 2: Run full validation.** Mobile typecheck and lint passed; full Vitest completed with baseline failures only; `git diff --check` passed.
- [x] **Step 3: Compare exact failures with the pre-Phase-4 baseline.** Full suite improved from 12 to 9 failed assertions. The remaining failures are the six compiled report assertions, OfficerDashboard import-resolution failure, and three RiskAssessmentResult assertions; no new failure identities appeared.
- [x] **Step 4: Write the Phase 4–6 change report.** Report records the implementation, verification evidence, required manual device verification, and deferred features. Stop after Phase 6.

---
