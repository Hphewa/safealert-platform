# Risk Assessment UX Phases 7–10

## Scope

Completed the officer reassessment, risk explanation, incident activity, draft recovery, accessibility, navigation, and consistency work described in the approved design and plan. Resident navigation and reporting flows retain their behavior. No API request contract or risk-policy change was introduced in Phases 9–10.

## Phase 7: Reassessment wizard

- Added a typed reassessment wizard with reason and evidence, situation and impact edits, changed-factor review, comparison, decision, and save stages.
- Reused shared factor fields and the existing server calculation and transactional reassessment endpoint. The fetched previous assessment stays immutable in the shared draft.
- Kept reassessment and decision reasons separate, retained override validation and duplicate-submit guards, and returned a successful save to Monitoring with a one-time update notice.
- Verification checkpoint: API/mobile typecheck and lint passed. Focused selection reported 269 passed and the three then-known saved-assessment heading assertions; the full suite added no failure names or files versus baseline.

## Phase 8: Risk explanations and incident activity

- The existing server scorer now returns factor contributions and a calculation version. Contribution points sum to its score; water contributes only for FLOOD. New and reassessed records persist server-generated snapshots, while legacy records remain valid and show an unavailable explanation.
- Added the officer-protected incident timeline from persisted incident, report, assessment, and warning records. Reassessment is represented once; timeline entries are separate from Assessment History.
- Added expandable explanations and timeline presentation without exposing related record IDs or asserting unsupported causal links.
- Verification checkpoint: API/mobile typecheck and lint passed; API focused selection reported 235 passed; mobile Phase 8 selection reported 55 passed plus three baseline assertions. Full suite reported 2,158 passed, 33 skipped, and the same nine baseline assertions.

## Phase 9: Draft recovery and accessibility

- Added AsyncStorage draft persistence under `safealert:assessment-draft:v1:${userId}`. Only editable fields and update time are stored; credentials and calculation previews are excluded. Per-user writes and clears are serialized, malformed payloads are rejected, and storage errors do not crash the flow.
- Recovery waits for authentication. Continue revalidates initial incident eligibility or the same active reassessment before restoring values. Start Again, discard, successful save, logout/account change, and leaving the assessment subtree clear persisted state.
- Added a retryable recovery prompt and a dirty `beforeRemove` guard. Internal wizard steps remain uninterrupted; deliberate exits offer Keep Editing or Discard.
- Added accessible loading, alert, button, selected, expanded, input-label, and keyboard-avoidance semantics across the assessment flow.
- Verification checkpoint: focused selection reported 42 passed across seven files; API/mobile typecheck and lint passed. Full suite reported 2,170 passed, 33 skipped, and the same nine baseline assertions.
- Expo dependency check reports existing version drift for Expo, React Native Screens, and TypeScript. Their versions were not changed because the repository instructions prohibit such upgrades unless required. AsyncStorage installed as SDK 57-compatible `2.2.0`.

## Phase 10: Consistency and hardening

- Promoted `expo-symbols` `~57.0.3` to a direct mobile dependency using Expo tooling. Officer navigation uses platform symbols, concise Home/Reports/Assess/Monitor/Warnings labels, nested route selection, accessible names and selected state, and 56-point item targets. Other roles keep the existing glyph behavior.
- Added `formatOperationalTime`: recent timestamps use “Just now,” minutes, or hours; older timestamps use local date/time; invalid values use “Time unavailable.” Applied it to queue evidence, reassessment, saved result/history, Monitoring activity, incident grouping, draft recovery, and warning publication.
- Removed visible assessment and report references, previous-assessment IDs, and unknown officer IDs from assessment presentation while preserving identifiers in route/API state. Known officer names remain visible; unknown names display “Officer.”
- Kept human-readable location labels and coordinate fallbacks. Risk and status remain readable as text, with explicit status accessibility semantics. Existing shared theme, badge, assessment layout, loading, error, and empty-state components remain in use.
- Corrected the saved-result screen encoding and separator so its heading renders correctly and passes lint. Its three baseline heading failures are now fixed.
- Haptics remain omitted; no new haptics dependency was added.

## Security and behavior review

- Backend role middleware, factor validation, server-side score calculation and recomputation, required override reasons, one-active-assessment uniqueness, transactional reassessment, warning eligibility/publication, and verified-evidence requirements remain authoritative.
- Assessment draft storage contains no auth tokens, and route guards remain navigation controls rather than security checks.
- “Close Assessment” retains its existing assessment-only meaning. No incident closure, client-side scoring, event-write model, friendly reference, or resident UX redesign was added.

## Validation

Fresh pre-Phase-7 baseline: 2,147 passed, 33 skipped, and nine failed assertions. Phase 9 completed at 2,170 passed, 33 skipped, and the same nine failures. Final Phase 10 focused navigation, time, accessibility, Monitoring, history, warning, contribution, and result selection passed 72 tests across 11 files.

API and mobile typecheck and lint passed. `git diff --check` passed. `expo install --check` reports existing version drift: Expo 57.0.22 vs ~57.0.26, React Native Screens 4.24.0 vs ~4.26.0, and TypeScript 5.9.3 vs ~6.0.3. No Expo, React, React Native, Expo Router, or native module version was upgraded.

### Final full-suite verification

Final Vitest run: **2,181 passed, 33 skipped, 6 failed assertions**. The six compiled report authorization failures are unchanged from the baseline. The OfficerDashboard import-resolution suite failure is also unchanged. The three baseline saved-assessment heading failures are fixed. No new failing test name or file was added. Report: `$env:TEMP/safealert-phase10-verified.json`.

## Device follow-up

No device or Expo Go verification was performed in this session. Check iOS and Android symbol rendering, restart/logout draft recovery, stale eligibility, dirty-exit behavior and gestures, keyboard/focus handling, large text and narrow screens, timeline and long evidence lists, image/map fallback, and complete initial/reassessment/save/warning/history workflows.

## Deferred scope and limits

Haptics, true incident closure, friendly server-generated references, advanced analytics, new risk thresholds, full offline assessment synchronization, and a separate event store remain out of scope. Native device behavior and accessibility at large font scales still require manual verification.
