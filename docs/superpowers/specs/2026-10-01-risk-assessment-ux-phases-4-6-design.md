# SafeAlert Risk Assessment UX: Phases 4–6

## Goal

Complete the officer risk-assessment workflow after Phase 3. Initial assessments use a short wizard, then show the calculated recommendation separately from the officer’s final decision. Monitoring presents incident state, verified evidence, and warnings in a compact, readable layout. Existing calculation, persistence, authorization, reassessment, and close semantics remain authoritative.

## Constraints

- No backend, shared contract, model, dependency, or persistent-storage changes.
- Keep Expo Go SDK 57 compatibility and use the existing `@safealert/contracts` and mobile API abstractions.
- Reuse the Phase 3 shared assessment draft provider and `HumanReadableLocation`.
- Keep reassessment on its existing form and workflow.
- Use the existing DashboardScreen scroll layout and sibling bottom navigation; do not add duplicate bottom padding.
- Do not invent factor contribution scores, incident closure behavior, a unified activity timeline, or user-facing technical identifiers.
- Retain existing request generation, stale-response, eligibility, duplicate-submit, conflict, and save-success protections.

## Phase 4: Initial assessment wizard

### Navigation and steps

The Phase 3 incident overview remains the entry point. Start revalidates eligibility, initializes or resumes the matching `INITIAL` draft, and opens the initial-only wizard. The sequence is:

1. **Situation** — hazard severity, people affected, and vulnerable people. Explain that vulnerable people may include children, older adults, people with disabilities, or people needing medical assistance.
2. **Impact & Access** — road accessibility and infrastructure impact.
3. **Environment** — water trend and weather conditions.
4. **Review** — read-only incident and factor summary with edit links to each input step.

Use the nested `/officer/assessments/wizard/[step]` route beneath the assessment layout so wizard steps share the existing draft provider and do not collide with `/[assessmentId]` or `/incident/[incidentId]`. Pass only identifiers and the step in route params, never factors. The Phase 3 Start action opens `situation` after its existing eligibility revalidation. Choosing a different incident initializes a clean draft for that incident.

The three input steps share a compact “Step N of 3” progress indicator with labels and a clear active step. Review shows a small hazard/location context header without repeating the report evidence list. Provide a lightweight way to return to Incident Overview. Back and edit navigation preserve the provider draft. Editing any factor invalidates the prior calculation preview through the existing reducer behavior. Reassessment retains the current full form and navigation.

Situation contains hazard severity, people affected, vulnerable people, and the supporting explanation. Impact & Access contains road accessibility and infrastructure impact, using existing enum values and reusable assessment option controls. Environment contains water trend and weather conditions, retaining text labels alongside any supplemental symbols and preserving current non-FLOOD scoring behavior.

### Input and validation

Use the existing form parser and validation rules. Validate before Continue, show errors only after a meaningful interaction, and place each message directly under its field. Counts must be integers and non-negative; vulnerable people cannot exceed people affected. Retain entered values and use numeric keyboards for counts. Inspect and reuse the app's existing `KeyboardAvoidingView` pattern so active fields and actions remain reachable on Android and iOS. The wizard is keyboard-aware and scrolls fields into view while preserving the existing DashboardScreen scroll layout and sibling bottom navigation; add no duplicate tab-bar padding. Step routes contain navigation state only; factors remain in the shared draft.

Review is read-only and groups all seven factors under Situation, Impact & Access, and Environment, each with an Edit action to its input step. Review validates the complete draft with the existing form/request validator before enabling calculation; invalid values guide the officer to the relevant step and never silently default. The action does not calculate on any input step. No full report evidence, report body, media player, or report reference IDs are added to the wizard.

## Phase 5: Recommendation, decision, and save

Review is the sole calculation entry point. It sends the exact validated factor snapshot through the existing calculate API and stores the response and factor snapshot in the shared draft. A dedicated Recommendation screen shows the system-recommended risk level as the dominant result, with score as secondary information; show both text and color. Include the allowed entered-factor summary and make clear that this is decision support and the officer must confirm the final risk. It does not imply per-factor contribution values.

A separate Final Decision screen makes the recommended level and score visible and lets the officer confirm it or choose another risk level. A matching decision shows optional **Officer Notes** and does not require an override reason. A different decision clearly states that the recommendation is being overridden and requires **Reason for Override** with the existing minimum length. Existing client/backend validation rules remain authoritative. Provide Edit Factors navigation back to Review or a specific step without destroying the draft. Returning to edit a factor invalidates the stale preview; saving is unavailable until recalculation.

Saving requires an explicit confirmation that summarizes the final risk and says the incident will be available in Monitoring, with Cancel and Save Assessment actions. Disable repeated save taps and show a saving state. The existing create endpoint, server-side recalculation, eligibility rechecks, authenticated officer, generation guards, duplicate-submit protection, conflict handling, and successful-save navigation remain in force. Failed saves retain the draft. Successful initial saves continue to Monitoring with a compact temporary one-time success notice and clear/reset the draft only after persistence succeeds. Reassessment continues to use its existing calculation and save flow.

## Phase 6: Monitoring presentation

The Monitoring list and detail continue to use existing monitoring and assessment-history APIs. They use the shared human-readable location component and display only server-provided information.

The list uses compact responsive cards with hazard, readable location, incident status, current assessment risk/status or latest closed risk/status, verified report count, new-evidence count/indicator, latest verified-evidence time, and a clear monitoring-detail action. It supports pull-to-refresh and retains distinct loading, error/retry, and empty states. Preserve existing resource reload behavior; do not add a large refresh button when pull-to-refresh is available.

The detail header uses a readable hazard name, incident status badge, and human-readable location. A current-risk card emphasizes risk level and shows score, assessed time, and View Assessment as secondary details. When verified evidence is new, show its server-reported count and explain that it may affect the current risk decision, with Review Evidence opening the returned recent verified reports. When the new count is zero, show a subtle “No new verified evidence since assessment” state or omit it if the page remains clear. Never guess which report is new; distinguish individual reports only when existing timestamps support it.

Separate Situation Summary, Recent Verified Reports, Warning, and Assessment History. Situation Summary shows verified report total, latest evidence time, and warning state. Recent report entries stay compact and show description preview, reported severity, and verified time; expand only where the established evidence pattern fits. Assessment History comes from the existing history endpoint and shows compact current/previous entries linking to existing result details. Do not show fake officer names or prominent predecessor IDs. Recent reports remain evidence and are not combined with assessment history into a fabricated activity timeline.

Draft and published warnings have distinct readable statuses; a draft must never appear publicly issued. For an ACTIVE assessment whose final risk is HIGH or CRITICAL and has no warning, show a contextual recommendation to consider creating a public warning and route to existing warning creation, which creates a draft. If a warning exists, provide the appropriate existing open/view route. Keep Reassess Risk primary, View Assessment secondary, and warning actions contextual. Preserve the existing **Close Assessment** wording and semantics; it must not imply incident closure. If there is no current assessment, do not show a current risk; use the latest visible assessment/history data according to existing API semantics.

The save-success notice appears once after a successful save as a compact temporary banner. Monitoring refreshes through existing resource lifecycle and pull-to-refresh, with retry for errors. Technical IDs are not shown to officers. New controls use meaningful headings, accessible button roles and touch targets, text in addition to risk color, and mobile-width layouts without clipped labels, oversized whitespace, or offscreen actions.

## Error and state behavior

- A failed or stale context/calculation request must not initialize a draft, overwrite newer values, or navigate after the route loses focus.
- A factor edit clears the calculation preview and requires a new Review calculation.
- Save remains blocked when the current backend eligibility or active-assessment conflict checks fail.
- Failed save keeps the draft available for correction or retry.
- Missing location labels retain formatted coordinates through the Phase 3 resolver.
- Empty evidence, no active assessment, no warnings, and no assessment history receive neutral explicit states rather than misleading risk or warning data.

## Verification plan

At each phase checkpoint, run focused tests for the changed workflow together with Phase 1–3 assessment and navigation coverage, existing reassessment tests, mobile typecheck, and lint. Compare failures to the captured baseline and do not continue to the next phase with newly introduced unresolved failures.

Phase 4 coverage includes exact factor grouping by step, step order/progress, inline touched validation, affected/vulnerable count constraints, form-value retention, keyboard-safe input behavior, read-only review/edit navigation, initial-only entry, draft preservation, clean drafts when changing incident, preview invalidation, and unchanged reassessment routing.

Phase 5 coverage includes calculation only on Review, exact submitted factors, risk-level/score hierarchy, recommendation display without invented contributions, matching and override decisions, optional matching notes, required override reason, edit invalidation, confirmation summary/cancel/save, busy and duplicate-save prevention, conflict/error draft retention, successful Monitoring navigation and one-time notice, and unchanged reassessment behavior.

Phase 6 coverage includes list/detail loading, errors, retry and pull-to-refresh, empty and no-current-assessment states, current/latest risk and score/assessed time, readable location and coordinate fallback, new-evidence zero/positive states, report summaries, assessment history links, warning none/draft/published states, HIGH/CRITICAL warning recommendation and LOW/MODERATE absence, warning routes, Reassess/View Assessment navigation, Close Assessment wording, technical-ID omission, responsive/accessibility behavior, and the one-time save notice.

At completion, run the full mobile test suite, mobile typecheck and lint, relevant Phase 1–3/reassessment tests, and `git diff --check`. Report pre-existing full-suite failures distinctly from regressions. Device follow-up should cover the full initial flow, back navigation with populated draft state, reassessment, Monitoring actions, compact layouts, and larger text.

## Deferred work

- Redesigning the reassessment form as the new initial wizard.
- Per-factor contribution or explanation scores unless supplied by the existing API.
- A unified incident activity timeline.
- True incident closure semantics.
- Stable friendly server-side references.
- Persistent drafts beyond the current provider lifecycle.
- Haptics and additional motion polish.
