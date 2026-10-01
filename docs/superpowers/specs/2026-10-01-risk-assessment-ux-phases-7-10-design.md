# SafeAlert Risk Assessment UX Phases 7–10 Design

## Purpose and approved scope

Complete the officer Risk Assessment and Incident Monitoring workflow after Phases 1–6. Phase 7 redesigns reassessment around what changed. Phase 8 adds authoritative scoring explanations and real-record incident activity. Phase 9 adds recovery, resilience, and accessibility. Phase 10 applies consistency and hardening across the existing officer workflow.

The user approved this design on 1 October 2026. Implementation will proceed as four strict checkpoints. After each phase, run focused tests, API and mobile TypeScript checks, lint, relevant previous-phase tests, and compare failures against the fresh pre-Phase-7 baseline. Stop if the phase adds an unexplained failure.

## Repository findings and baseline

Phases 4–6 are present in the active checkout, with changes still uncommitted. Initial assessment uses the nested wizard route and shared in-memory `RiskAssessmentDraftProvider`. Reassessment currently loads an assessment into the same `CreateRiskAssessmentScreen`, which combines reason, factor editing, calculation, decision, and save. The backend already performs reassessment with one repository transaction through `POST /api/v1/risk-assessments/:assessmentId/reassess`.

Authoritative risk scoring is in `riskCalculation.service.ts`; the service is reused by calculate, create, and reassess. Existing records keep their factors, score, system suggestion, final decision, lineage, and assessment/closure timestamps, but not contribution details. Incident creation, report creation and verification history, assessment creation/reassessment/closure, and warning creation/publication have persisted timestamps. `IncidentLifecycleService` already aggregates the incident, report, assessment, and warning repositories and is mounted behind the officer-only incident router. This supports an activity timeline without an event collection.

No AsyncStorage or haptics package is currently installed or declared in the mobile app. The existing `DashboardGlyph` renders letter pairs rather than icons. Expo Symbols 57.0.3 is present transitively through `@expo/ui` in the lockfile, but is not declared as a direct mobile dependency; Phase 10 will promote it to a direct dependency. Expo Symbols is selected for officer navigation; AsyncStorage is selected for small, non-secret draft state. Haptics are omitted because they are optional and would add a separate native feature dependency.

Fresh baseline before Phase 7:

- API typecheck: passed.
- Mobile typecheck: passed.
- Mobile lint: passed.
- Focused assessment/reassessment/Monitoring/warning/API selection: **297 passed, 3 failed**, 300 total across 16 files. The failures are RiskAssessmentResult assertions: `does not show the previous close result after the mounted route loads another assessment`; `ignores an old close request that resolve after switching routes`; and `ignores an old close request that reject after switching routes`. They expect a middle dot in the saved-assessment heading, while the rendered value contains a replacement glyph.
- Full Vitest: **2,147 passed, 33 skipped, 9 failed assertions**, 2,189 total tests. Failures are:
  - `apps/api/dist/modules/reports/tests/report.integration.test.js`: `report API returns 403 when a RESIDENT user attempts to VERIFY a report`; `report API returns 403 when a COMMUNITY_VOLUNTEER user attempts to VERIFY a report`; `report API returns 403 when a EMERGENCY_RESPONDER user attempts to VERIFY a report`; `report API returns 403 when a RESIDENT user attempts to REJECT a report`; `report API returns 403 when a COMMUNITY_VOLUNTEER user attempts to REJECT a report`; `report API returns 403 when a EMERGENCY_RESPONDER user attempts to REJECT a report`.
  - `apps/mobile/src/features/dashboards/officer/screens/OfficerDashboardScreen.test.tsx`: suite import-resolution failure before its tests run.
  - `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.test.tsx`: the three saved-assessment heading assertions listed above.

The exact baseline JSON is at `$env:TEMP/safealert-phase7-10-baseline.json` for this session. These failures are baseline and are not authorization to overlook any new failure.

## Global invariants

- Preserve report verification, incident grouping, authentication/RBAC, warning publication, uniqueness, backend validation, and transactional reassessment behavior.
- The backend remains the only authority that calculates risk. Calculation, create, and reassess continue to invoke the same server scoring function.
- Do not invent point contributions, timeline events, location names, incident closure, user identities, or friendly reference numbers.
- Do not introduce a state-management framework or change resident workflows except where a shared component requires it.
- Do not remove duplicate-submit guards, the one-active-assessment index, or server transaction protections.
- Keep Expo Go SDK 57 compatibility and do not upgrade or downgrade Expo, React, React Native, Expo Router, or native modules.
- Do not store credentials or tokens with assessment drafts. Do not persist a calculation preview as current.
- Keep “Close Assessment” semantics; do not implement incident closure.
- Maintain readable text alongside color for risk and status, and keep Assessment History distinct from Incident Activity.

## Phase 7 — Reassessment UX redesign

### Route and state

Add a typed reassessment route under the assessment subtree, using an explicit step parameter and the existing `assessmentId`. The route carries identifiers and step only; factors and reason remain in the shared draft provider. Extract/reuse Phase 4 factor entry sections so the initial and reassessment forms share options, labels, validation, keyboard behavior, and layout.

Keep the fetched active assessment as an immutable `previousAssessment` snapshot, separate from editable reassessment factors. Initialize factors from its saved factor values. Do not mutate the API object. The existing reassessment endpoint and request contract remain unchanged.

### Steps and behavior

1. **Reason & Evidence:** show current final risk, score, and assessed time; display UX-only reason prompts; collect the required free-text `reassessmentReason`; show current server-provided new verified evidence count and recent verified reports. Prompts may help compose the text reason, but no category enum is sent or persisted as a contract change. New evidence is informative and never a prerequisite.
2. **Update Situation:** prefilled severity and population factors, with changed-value comparisons and readable “Changed”/numeric difference labels.
3. **Update Impact & Environment:** prefilled road, infrastructure, water, and weather factors with the same meaningful change indicators.
4. **Review Changes:** show the previous risk and only factors that differ from the immutable previous snapshot. Include the text reassessment reason and a way to review all factors. Calculate calls the existing calculate endpoint and does not save.
5. **Comparison:** show previous final officer risk against the new server recommendation, score, and whether the risk level changed. Do not attribute a change to individual factors.
6. **Final Decision:** reuse Phase 5 matching/override rules. The reassessment reason and decision reason remain separate. A matching decision allows optional notes; an override requires the existing 10–500 character decision reason.
7. **Save:** use only the existing reassess endpoint. Preserve server recomputation and the atomic old-ACTIVE-to-CLOSED/REASSESSED plus new-ACTIVE transaction. Duplicate-submit guards remain. On success clear the draft and return to Monitoring with a one-time “Assessment updated” notice. Recoverable errors retain user input.

Any factor edit invalidates the calculation preview. Stale or blurred async work cannot overwrite current state or navigate. Back navigation preserves a valid draft; a deliberate exit is handled by Phase 9’s discard guard.

## Phase 8 — Risk transparency and operational history

### Authoritative calculation contributions

Refactor `calculateRisk` to return the calculated score, suggested level, and a contribution array from one set of scoring rules. The API calculate response returns the breakdown. Each entry has a strict shared factor key, display label, selected value, and points. For non-FLOOD hazards, omit water from contributing entries because the existing score does not include it. Contribution totals must equal the returned score.

Persist the server-generated contribution snapshot and a calculation-rules version with newly created and reassessed records. The create/reassess request schemas do not accept client-supplied contributions. Add fields as optional in the shared safe assessment response and model, preserving reads for existing records. Existing historical records without the new snapshot display “Calculation details unavailable”; do not recalculate their explanation under newer rules. The version is an audit marker, not a client scoring mode.

The Recommendation screen shows risk and score first, then expandable “Why this recommendation?” details using only server-returned entries and total. Saved assessment details show expandable Calculation Details only when a stored snapshot exists. Monitoring cards do not show each contribution.

### Incident Activity timeline

Add an officer-protected `GET /api/v1/incidents/:incidentId/timeline` route to the existing incident module and `IncidentLifecycleService`. Compose events from its existing repositories; create no event model or event writes. Return a shared discriminated union ordered newest-first with deterministic tie ordering. Event IDs may be opaque record-derived keys for list rendering; related record IDs are route data only and are not printed in UI.

Supported event sources and behavior:

- `INCIDENT_CREATED` from the incident’s stored `createdAt`.
- `REPORT_CREATED` from associated reports’ stored `createdAt`.
- `REPORT_VERIFIED` from real verification-history entries; use `verifiedAt` as a legacy fallback when history is absent. Do not invent a verification event from current status alone.
- `ASSESSMENT_CREATED` from an initial assessment’s `assessedAt` and saved final decision.
- `ASSESSMENT_REASSESSED` from a new assessment’s `previousAssessmentId`, `assessedAt`, and saved old/new final decisions. Suppress the corresponding `REASSESSED` closure as a second timeline event.
- `ASSESSMENT_CLOSED` only for manually closed assessments with a real `closedAt` and closure reason.
- `WARNING_CREATED` from `createdAt` and `WARNING_PUBLISHED` from `publishedAt`; a draft must not appear as published.

Only records associated with the requested incident are included. Exclude deleted assessments according to the current history repository semantics. Return 404 for an unknown incident and keep the existing disaster-officer RBAC boundary. Add “Incident Activity” as a separate Monitoring detail section; show actual saved decisions and timestamps without causal claims. Keep Assessment History focused on assessment versions and links.

## Phase 9 — Reliability, persistence, accessibility, feedback

### Draft persistence and recovery

Install the Expo-compatible AsyncStorage package using `npx expo install` and verify dependency compatibility. Store one schema-versioned draft per authenticated user under a user-scoped key. Persist mode, incident/assessment identity, factors, final decision, decision reason, reassessment reason, previous reassessment context as needed, and update time. Never persist tokens. Never restore calculation preview; restoring an editable draft clears the preview and requires recalculation. Storage is local and unencrypted; the stored payload is limited to the requested draft fields.

On assessment route entry, hydrate only the signed-in user’s draft. A matching draft offers Continue or Start Again. Before Continue, revalidate initial incident eligibility or that the reassessment target is still the current ACTIVE assessment. If stale, discard the draft and offer the existing Overview/Monitoring route. Corrupt, unsupported-version, or failed storage reads show a recoverable state and do not crash the flow. Serialize writes so older asynchronous writes cannot replace a newer draft. Explicit reset, successful initial/reassessment save, Start Again, deliberate discard, and logout clear the applicable draft. A screen unmount alone does not clear it.

Dirty flow exit prompts “Discard assessment draft?” with Keep Editing and Discard. Normal movement among wizard steps does not prompt. Prevent stack gestures/actions from bypassing the guard. A blank untouched draft is not considered dirty.

### Loading, errors, success, and accessibility

Use lightweight local skeletons or accessible activity states for queue, overview, Monitoring, and history. Standardize user-facing load/calculate/save errors and keep retry actions. Recoverable errors preserve the draft; success banners are compact and one-time. Do not add a toast dependency. Add labels, roles, selected/expanded state, alert semantics, adequate touch sizes, screen-reader order, and keyboard avoidance to assessment and Monitoring controls. Location always has textual context. Layouts must tolerate small widths, long labels/locations, and larger text without relying on color alone.

Do not add haptics in this scope: there is no installed Haptics module, and no meaningful action needs vibration to be understood.

## Phase 10 — Final consistency and hardening

- Replace the officer letter-pair glyphs with Expo Symbols; use concise Home, Reports, Assess, Monitor, Warnings labels and indicate active nested sections with icon and text/shape semantics, not color alone. Preserve navigational destinations and suitable touch targets.
- Reuse `dashboardTheme`, existing assessment styles, `PriorityBadge`, and `StatusBadge`; define only small shared typography/spacing tokens required to align Queue, Overview, wizard, decision, Monitoring, result, and reassessment screens.
- Standardize primary, secondary, navigation, and terminal action hierarchy without changing backend behavior or adding true incident closure.
- Use compact headers and predictable back behavior. Audit `HumanReadableLocation` use and preserve the Phase 3 coordinate fallback.
- Remove raw MongoDB IDs from primary officer assessment/result/history UI. Keep IDs in API/state and route parameters; show an officer’s known name or generic “Officer,” not another user’s raw identifier or an invented friendly reference.
- Reuse a shared time formatter: relative timestamps through 24 hours for operational scanning (`Just now`, minutes, or hours ago), exact local date/time for older audit context. Keep an explicit unavailable state for invalid dates.
- Standardize useful empty states for queue, Monitoring, history, and evidence.
- Audit narrow width, long text, font scaling, keyboards, footer overlap, horizontal clipping, list keys, duplicate requests, and repeated geocoding/timeline work. Virtualize or progressively reveal only lists shown to be potentially large within the existing dashboard scroll architecture.
- Review that server validation, RBAC, scoring, override reason, active-assessment uniqueness, reassessment transaction, warning eligibility, and verified-evidence requirements remain authoritative.

## Checkpoints and acceptance

For each phase, run changed-flow tests plus the previous phase workflow tests, API and mobile typechecks, mobile/API lint, and review exact failures against the baseline. Phase 7 must cover prefill, reason/evidence states, factor differences, review, calculation invalidation, comparison, decision, transaction request, navigation, draft reset, and initial-flow preservation. Phase 8 must cover every contribution, risk thresholds, FLOOD/non-FLOOD water behavior, totals, server recomputation, persistence/backward compatibility, timeline source events/order/omissions/RBAC/not-found, and mobile breakdown/timeline rendering. Phase 9 must cover user scoping, recovery, stale eligibility, Start Again, save/logout/discard cleanup, corrupt/failing storage, no preview restoration, accessible semantics, retry retention, and success. Phase 10 must rerun assessment, reassessment, Monitoring, warning, history, draft, and prior phase suites, plus regression review.

After Phase 10 run API and mobile typechecks, both lints, API/mobile focused tests, warning integration tests, and full Vitest. Compare exact test and suite failures to the baseline. No unexplained new failures are acceptable. Device checks remain necessary for Expo Go/native icon rendering, draft restart/logout recovery, keyboard/back gestures, large text/small screens, haptics omission, timeline presentation, and the complete initial/reassessment/warning/history workflows.

## Out of scope

True Incident Closure, friendly server-generated references, full offline officer assessment synchronization, advanced analytics, warning publication changes, new risk thresholds, a separate event database, and any resident workflow redesign are deferred.
