# Phases 4–6: Risk Assessment Wizard and Monitoring UX

## A. Scope

Implemented the approved SafeAlert Risk Assessment UX Phases 4–6 design. Initial assessment now uses a guided wizard, recommendation and final-decision stages, and an explicit save confirmation. Officer Monitoring now presents compact incident summaries and a structured monitoring detail view.

## B. Baseline

Before Phase 4, the full Vitest suite reported **2,131 passed, 33 skipped, and 12 failed assertions** (2,176 total tests, with 6 failing suites). Mobile typecheck and lint passed. The 12 assertion failures were six compiled report integration cases, two MonitoringDetail expectations, one Monitoring list test, and three RiskAssessmentResult assertions. OfficerDashboard was the sixth failed suite because of an import-resolution error before its tests ran.

## C. Phase 4 files and route

Created:

- `apps/mobile/app/officer/assessments/wizard/[step].tsx`
- `apps/mobile/src/features/dashboards/officer/components/AssessmentProgress.tsx`
- `apps/mobile/src/features/dashboards/officer/screens/InitialAssessmentWizardScreen.tsx`
- `apps/mobile/src/features/dashboards/officer/screens/InitialAssessmentWizardScreen.test.tsx`

Modified the incident overview Start destination, assessment draft/navigation components, and their tests. The initial-only route is `/officer/assessments/wizard/[step]`; it carries the incident reference and step only. The legacy initial-create route redirects to Situation. Reassessment remains on the existing route and form.

## D. Situation step

Situation groups hazard severity, affected population, and vulnerable population. Population inputs use numeric keyboards and existing validation. A vulnerable count greater than affected count displays an inline error and blocks continuation. Errors are shown after interaction.

## E. Impact and access step

Impact & Access groups road access and infrastructure impact using the existing factor values, labels, and descriptions. It updates the shared assessment draft.

## F. Environment step

Environment groups water level and weather. The UI describes non-flood water-level scoring in terms of the existing calculator behavior; it does not change risk scoring or thresholds.

## G. Review and progress

Review presents the factors read-only, validates the complete draft, and links back to each editable step. Progress communicates steps 1 of 3 through 3 of 3. The overview hazard and Phase 3 human-readable location remain available in the wizard context, with a route to Incident Evidence.

## H. Draft handling

Wizard values use the existing in-memory `RiskAssessmentDraftProvider`. Changing factors continues to invalidate any previous calculation preview. Starting a different incident cannot carry over the candidate draft. No persistent storage was introduced.

## I. Phase 4 checkpoint

The Phase 4 focused selection passed **48 tests across 8 files**. Mobile typecheck and lint passed. Tests cover factor grouping, route selection, validation, draft isolation, Review navigation, and reassessment routing.

## J. Phase 5 files and calculation

Created `apps/mobile/src/features/dashboards/officer/components/RiskRecommendation.tsx` and extended the wizard and its tests. Review is the only initial-flow step that calls the existing calculation API. It revalidates current incident eligibility, submits the existing factor request, and stores the returned result with its factor snapshot in the shared draft. Obsolete or blurred requests cannot replace current state or navigate.

## K. Recommendation

The dedicated Risk Recommendation stage makes the existing system risk level visually dominant and presents its score secondarily. It summarizes entered factors using existing labels. It does not estimate or claim per-factor contributions.

## L. Final decision

Final Decision presents the recommendation alongside the officer’s risk-level choice. A matching choice permits optional notes. An override is labeled as an override and requires a reason using the existing validation. Editing factors returns to the relevant wizard stage and invalidates the recommendation preview.

## M. Save confirmation and lifecycle

Save requires a confirmation that states the final risk and that the assessment will be available in Monitoring. Cancel returns to the decision; confirmation saves through the existing create API. Busy state and duplicate-submit guards prevent repeated saves. Failure leaves the draft available for correction or retry. Success resets the draft and navigates to Monitoring with a temporary “Assessment saved” notice. Existing backend conflict checks remain in force.

## N. Phase 5 checkpoint

The Phase 1–5 focused selection passed **57 tests across 8 files**. Mobile typecheck and lint passed. The wider selection including RiskAssessmentResult reproduced only its three baseline failures.

## O. Phase 6 files

Modified:

- `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringScreen.tsx` and `.test.tsx`
- `apps/mobile/src/features/dashboards/officer/screens/OfficerMonitoringDetailScreen.tsx` and `.test.tsx`

The implementation uses the existing monitoring, risk-assessment history, warning, location, and dashboard abstractions. No endpoint or response contract changed.

## P. Monitoring list

Monitoring cards show the hazard, incident status, readable location, current or latest assessment risk/status, verified-report count, and new evidence count when available. They omit technical IDs and raw coordinates. Cards navigate to the existing detail route. Pull-to-refresh uses the existing resource reload and dashboard layout.

## Q. Monitoring detail and current risk

Detail separates the incident header, current/latest assessment, situation summary, evidence, warnings, and assessment history. Active current risk shows its level, score, assessment time, and View Assessment action. Closed assessments appear as latest history; incidents without an assessment show a neutral state. Assessment IDs are used only in route parameters and are not rendered.

## R. Evidence

The evidence banner uses the existing server-provided new-verified-evidence state and count. It explains that new evidence may affect the current decision and can expand recent report descriptions. Zero new evidence gets a quiet message. The summary includes total verified reports and latest evidence time; recent reports show description, reported severity, and verification time.

## S. Warnings and actions

Warning state is identified as None, Draft, or Published. Existing warnings link to their existing detail routes. A creation recommendation appears only when the current assessment is ACTIVE, HIGH or CRITICAL, and has no associated warning. The copy says creation saves a draft for review and does not publish automatically. Reassess, View Assessment, and Close Assessment retain their existing routes and lifecycle semantics.

## T. Assessment history and refresh

The existing history API supplies a date-ordered Current/Previous list with readable risk, status, score, and time. Entries open the existing assessment detail route. History load errors can be retried. Pull-to-refresh reloads both monitoring detail and history. There is no unified incident timeline.

## U. Reassessment preservation

Reassessment remains on `/officer/assessments/create` with its existing reason, calculation, save, and navigation behavior. The wizard redirect only applies to the legacy initial-create route. Phase 3 overview and shared-draft behavior remain intact.

## V. Focused verification

The final Phase 1–6 focused selection passed **81 tests across 12 files**, including wizard, draft, queue, incident overview, assessment workflow, Monitoring list/detail, warning workflow, and reassessment coverage. Mobile TypeScript typecheck passed. Mobile lint passed.

## W. Full Vitest comparison

The final full run reported **2,147 passed, 33 skipped, and 9 failed assertions** (2,189 total tests, with 4 failing suites), compared with 2,131 passed and 12 failed assertions at baseline. All nine remaining assertion failures match baseline, and the same OfficerDashboard import-resolution error remains:

- Six compiled report integration assertions (VERIFY/REJECT forbidden-role cases).
- Three RiskAssessmentResult route/close-request assertions.

The OfficerDashboard suite still fails before its tests run because of the same import-resolution error. The three baseline Monitoring assertions now pass. No new failing test or suite identity appeared.

The compiled integration failures and unrelated baseline suites were not changed as part of this work.

## X. Diff validation and scope

`git diff --check` passed. No backend, shared contract, model, dependency, or storage changes were made. Existing APIs and calculations remain authoritative.

## Y. Manual device verification

No device or Expo Go session was available for manual verification. Recommended checks:

- Complete Situation → Impact & Access → Environment → Review → Recommendation → Final Decision → Confirm Save on a compact device and with large text.
- Exercise numeric keyboards, validation errors, keyboard dismissal, back gestures, factor edits after calculation, save cancellation, duplicate taps, and save failure/retry.
- Confirm the saved assessment appears in Monitoring and the one-time notice expires.
- Check Monitoring with active, closed, and absent assessments; zero and positive new evidence; no warning, draft, and published warning; HIGH/CRITICAL and lower-risk states; long report descriptions; history errors; and pull-to-refresh.
- Verify readable location and coordinate fallback on supported platforms.

## Z. Deferred scope and limits

This work stops after Phase 6. There is no incident closure feature, unified timeline, factor-contribution estimate, new backend eligibility guarantee, persistence of an unfinished draft, automatic warning publication, or reassessment redesign. Platform geocoding still follows the Phase 3 best-effort behavior. The backend remains the final authority for save-time conflicts.
