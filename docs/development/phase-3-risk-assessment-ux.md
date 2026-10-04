# Phase 3: Incident Overview and location presentation

## Scope and baseline

Implemented Queue → Incident Overview → Start Assessment → existing assessment form. The existing calculation, decision, save, Monitoring, and reassessment flows retain their behavior. No backend, contract, model, dependency, or persistent-storage changes were made.

Before editing, the full Vitest run reported **2,088 passed, 33 skipped, 12 failed tests**. The five failing files were the compiled report integration tests, OfficerDashboard (an import-resolution failure), OfficerMonitoring, OfficerMonitoringDetail, and RiskAssessmentResult. Mobile typecheck and lint passed; the two focused queue files had 10 passing tests.

## Files created

Under `apps/mobile/`:

- `app/officer/assessments/incident/[incidentId].tsx`
- `src/features/dashboards/officer/api/incidentOverview.ts` and `.test.ts`
- `src/features/dashboards/officer/components/AssessmentFlowBackLink.tsx`
- `src/features/dashboards/officer/components/AssessmentPage.navigation.test.tsx`
- `src/features/dashboards/officer/components/VerifiedReportAccordion.tsx` and `.test.tsx`
- `src/features/dashboards/officer/hooks/useIncidentOverview.ts`
- `src/features/dashboards/officer/hooks/useAssessmentResource.test.ts`
- `src/features/dashboards/officer/screens/IncidentOverviewScreen.tsx` and `.test.tsx`
- `src/features/dashboards/shared/maps/HumanReadableLocation.tsx`
- `src/features/dashboards/shared/maps/locationLabel.ts` and `.test.ts`
- `src/features/dashboards/shared/maps/useLocationLabel.ts` and `.test.ts`

This report is also new. The existing Phase 2 presentation helper and its test were already present, although still untracked, when Phase 3 began.

## Files modified during Phase 3

Under `apps/mobile/src/`:

- `expo-modules.d.ts`: declares the installed Expo reverse-geocoding and permission-query APIs used by this phase.
- `features/dashboards/officer/components/RiskAssessmentComponents.tsx`: optional initial-form back link to the overview; default page navigation retains its prior behavior.
- `features/dashboards/officer/hooks/useAssessmentResource.ts`: reload returns its current result for guarded navigation; errors and obsolete requests return no result.
- `features/dashboards/officer/screens/CreateRiskAssessmentScreen.tsx` and `.test.tsx`: initial-form back destination and draft-preservation coverage. No form/calculation redesign.
- `features/dashboards/officer/screens/OfficerRiskAssessmentsScreen.tsx` and `.test.tsx`: overview navigation and shared location labels.

`DashboardScreen.tsx` already had the Phase 2 refresh-control change and received no further Phase 3 changes.

## Route, layout, and evidence

The new route is `/officer/assessments/incident/[incidentId]`. It lives under the existing assessment draft provider and does not conflict with `/officer/assessments/[assessmentId]`.

Queue cards previously opened `/officer/assessments/create`; they now open the overview, passing only `incidentId`. The overview uses a compact back link, a readable hazard heading, a textual assessment status, location/report-count/latest-evidence summary, a 200-point map, reported-severity counts, collapsible verified reports, and one Start Assessment action.

The map reuses `LocationPreview` with the incident's existing coordinates. Its native implementation is read-only. The existing web coordinate-preview fallback remains available.

Only verified reports returned by the context are presented as evidence. Reported severity is counted by its actual value and explicitly distinguished from official officer risk. Collapsed reports use two-line description previews; expanded reports show full descriptions, reported severity, verification status, report/verification times, location, and available remote image evidence. Report locations resolve only when their evidence is expanded. No technical identifiers or voice player are added to this presentation.

## Location resolution

Queue cards, incident summary, and expanded report evidence share `HumanReadableLocation` and `useLocationLabel`. They show formatted coordinates immediately and replace them with a platform-provided locality/region label when available.

The resolver uses the installed Expo Location dependency, an in-memory cache keyed by exact coordinates, and serial native geocoder requests. Simultaneous requests for the same point share one promise. Results, including failure fallbacks, are cached for the app session. Missing fields are omitted, duplicate locality/region names are collapsed, and absent usable results retain coordinates. Hook cleanup prevents results for old coordinates or unmounted views from replacing current labels.

No permission prompt or current-position request is made. Expo's Android implementation requires existing foreground location permission for geocoding; without it, coordinates remain visible. Web also uses coordinates because the installed Expo geocoder does not support web. A cached failure does not automatically retry after connectivity or permission changes during the same session.

## Draft and back navigation

1. Selecting a queue card deliberately resets the prior candidate draft, then pushes the overview.
2. Opening, rendering, or focusing the overview does not initialize or reset the draft.
3. Start revalidates incident eligibility. It initializes an INITIAL draft only if no matching INITIAL draft exists; a matching draft preserves factors, calculation preview, final decision, and reason.
4. The initial form's back link dismisses to that incident's overview, preserving the provider and draft. If the overview is absent, Expo Router replaces the current route with it.
5. The overview's explicit back link resets the candidate and dismisses to the existing queue, avoiding a duplicate queue entry. Native stack back preserves the draft until another candidate is chosen or the assessment subtree is left.
6. Existing successful-save and subtree-exit reset behavior remains in place. Reassessment initialization/navigation remains unchanged.

## Current context and concurrent changes

The overview loads `GET /api/v1/risk-assessments/incident/:incidentId` through the existing abstraction. The endpoint returns only the active assessment, while initial queue eligibility also excludes historical assessments. For otherwise valid initial candidates, the loader therefore checks membership in the existing assessment queue endpoint. It does not recreate historical eligibility rules in the client.

Start repeats this load and membership check. Existing assessments, inactive incidents, absent verified evidence, lookup failures, or queue removal disable the action. A current assessment can be opened directly; other stale states offer the queue or Monitoring. The loader maps the backend's invalid-evidence response to a readable message. Repeated Start presses and completions after blur cannot initialize a draft or navigate again. Existing form-load and backend-save conflict checks remain the final protection against changes after the Start check.

## Verification and manual follow-up

Mobile typecheck and lint passed. The focused Phase 3, queue, draft, and assessment workflow selection passed **70 tests across 12 files**. These cover location success/fallback/caching, late results, map coordinates, report expansion, draft preservation, Start revalidation, existing calculation/save behavior, and return navigation.

The first full run had one extra resident cancellation integration failure at about five seconds. That test took 4.4 seconds in the baseline; its complete 118-test file subsequently passed in isolation. No resident production or test files were changed. The full rerun with two workers reported **2,131 passed, 33 skipped, 12 failed tests**. Comparing failed test names and failed file names with the baseline produced no differences. The resident cancellation test passed in 1.6 seconds in this rerun, consistent with timing contention in the earlier run. This phase adds 43 passing tests. `git diff --check` also passed.

Recommended device checks: queue → overview → Start → calculate → decision → save → Monitoring; form → overview → Start with populated factors and preview; native back gestures; direct overview links; long/mixed-severity report lists; image failures; native map loading; Android with and without existing permission; geocoder failure/offline mode; compact layouts and large text. No device screenshots or manual Expo Go verification were performed in this session.

Remaining limits are best-effort platform geocoding, session-cached failures, existing network-dependent map tiles, and the unavoidable race after eligibility revalidation that is still enforced by the backend. Phase 4 has not begun; the shared draft and nested route are ready for a later wizard refactor.
