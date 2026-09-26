# LDFEW-112: Create warning from a saved risk assessment

## Implemented behavior

The saved assessment result offers **Create Warning** only when `finalRiskLevel` is
`HIGH` or `CRITICAL`. It passes the persisted assessment ID to
`/officer/warnings/create`. The form fetches the saved assessment again, including
on direct navigation; LOW and MODERATE assessments cannot open an editable form.

The flow is warning details, Review Warning, optional Edit Warning, and Save Warning
Draft. Review is an in-memory step on the create route, matching the existing officer
form/decision pattern. Editing preserves form values. Saving shows the returned warning
reference and DRAFT status. Request errors retain the review for retry. Save is guarded
against repeated taps while a request is pending, and late responses are ignored after
navigation or session changes.

Required fields are Affected Area, Required Action, Unsafe Roads, and Reason / Message.
The Create Warning screen now displays Affected Area as read-only GPS coordinates from
the saved source report (the first report ID in the assessment's incident, matching
the warning service's `hazardReportId`). Reports currently store coordinates, not town
names or area boundaries. The form reuses the existing coordinate formatter and includes
that value in the existing `affectedArea` request field. Review, saved warning, and Publish
retain this value. Missing source locations block review; there is no manual-area fallback.
The information card uses responsive risk/location panels and styled safety instruction
fields, with the warning form width constrained on desktop.
Unsafe Roads follows the required asterisk in the brief; the officer can explicitly enter
"None known". Safe Routes and attachments are optional. Risk Level is read-only and comes
from the saved assessment. No risk calculation or assessment mutation is performed.

There was no wireframe asset in the repository. The UI follows the existing SafeAlert
officer components and theme using React Native StyleSheet: card spacing, blue actions,
existing risk badges, multiline inputs, inline errors, step indicators, keyboard avoidance,
and a draft confirmation. No CSS framework or dependency was added.

Attachments are up to five HTTP(S) media links, following the existing media-reference
architecture. No file upload service, local-file sharing, or binary database storage was
introduced.

## API and storage

`POST /api/v1/warnings` authenticates through the existing middleware and requires
`DISASTER_OFFICER`. It accepts `assessmentId`, `affectedArea`, `requiredAction`,
`unsafeRoads`, `message`, optional `safeRoutes`, and optional `attachments`.

The server retrieves the assessment through the existing assessment repository, returns
404 if it does not exist, and returns 409 `WARNING_RISK_NOT_ELIGIBLE` for LOW/MODERATE.
Malformed IDs, invalid fields, and unknown fields return 400 through the existing error
envelope. The strict schema rejects client-supplied `riskLevel`, `finalRiskLevel`, officer
identity, report relationship, status, and timestamps.

The server assigns `riskLevel` from the saved `finalRiskLevel`, `createdById` from the
authenticated officer, `assessmentId` and `hazardReportId` from the assessment, and status
`DRAFT`. Mongoose manages `createdAt`/`updatedAt`. Relationships reference RiskAssessment,
Report, and User. The response is HTTP 201 `{ warning }`.

LDFEW-113 adds `POST /api/v1/warnings/:warningId/publish`. Publication accepts only a
strict notification target: `AFFECTED_AREA`, `DISTRICT` with one of the supported
districts, or `WHOLE_COUNTRY`. It reads `affectedArea` and `riskLevel` from the saved
warning; neither can be supplied or changed during publication. The selected notification
target is stored separately on the warning, and the server atomically enforces
`DRAFT -> PUBLISHED`, `publishedAt`, and `publishedById`. A post-publication handler hook
is available for LDFEW-127 notification processing; notification delivery is not part of
this warning module and must not change a published warning back to DRAFT.

There are no resident warning, update, cancellation, or archive endpoints. Assessment
internals remain unchanged; the assessment screen only provides the existing warning flow.

## Verification performed

| Command | Result |
| --- | --- |
| `npm exec vitest run` (repository root, final run) | Passed: 18 files, 263 tests |
| `npm run typecheck` (repository root, final run) | Passed: API, mobile, contracts |
| `npm run lint` (repository root, final run) | Passed: API, mobile, contracts |
| `npx expo export --platform android --output-dir ../../build/warnings-android` (apps/mobile) | Failed: installed `@expo/ui` is missing `src/jetpack-compose/modifiers`, required by Expo Router |

New test coverage included in the full run:

| Test file | Tests | Coverage |
| --- | --- | --- |
| `apps/api/src/modules/warnings/tests/warning.integration.test.ts` | 28 | HIGH/CRITICAL drafts, LOW/MODERATE rejection, authentication, every non-officer role, malformed/missing assessments, forged fields, required/optional validation, derived identities, assessment preservation |
| `apps/api/src/modules/warnings/tests/warning.model.test.ts` | 10 | MongoDB schema references, serialization, DRAFT default, invalid risks/status/text/attachments |
| `apps/mobile/src/features/dashboards/officer/warningForm.test.ts` | 15 | Eligibility, required fields, length limits, trimming, review payload, media-link validation |
| `apps/mobile/src/features/dashboards/officer/api/warningWorkflow.test.ts` | 5 | Real mobile API client to Express: saved assessment, form, review/edit, save, reopen for both eligible risks; ineligible risks and network failure |
| `apps/mobile/src/features/dashboards/officer/screens/warningScreens.test.tsx` | 10 | Real screen rendering with native primitives mocked: button visibility/reopen, direct-route blocking, read-only risk/form, loading, review summary and disabled saving actions |

The initial restricted Vitest attempt failed before executing tests with `spawn EPERM`.
After allowing test worker processes, the first targeted run passed 53 tests but found an
incorrect relative import in the new warning API adapter. The import was corrected;
the final complete suite passed. The screen-only command
`npm exec vitest run apps/mobile/src/features/dashboards/officer/screens/warningScreens.test.tsx`
also passed all 10 tests before the final full run.

API integration tests use in-memory repositories. Model tests validate Mongoose schemas
without a live MongoDB connection. Screen rendering and API workflow tests are not physical
device interaction tests. The Android bundle failure is in installed Expo dependencies;
no Expo, React, React Native, Router, or native-module versions were changed. Physical
device layout/keyboard interaction and a live database save remain unverified.

## Exact changed-file inventory

Modified:

- `apps/api/src/app.ts`
- `apps/mobile/src/features/dashboards/officer/screens/RiskAssessmentResultScreen.tsx`
- `packages/contracts/src/index.ts`

Added:

- `apps/api/src/modules/warnings/controllers/warning.controller.ts`
- `apps/api/src/modules/warnings/models/warning.model.ts`
- `apps/api/src/modules/warnings/repositories/inMemoryWarning.repository.ts`
- `apps/api/src/modules/warnings/repositories/mongooseWarning.repository.ts`
- `apps/api/src/modules/warnings/repositories/warning.repository.ts`
- `apps/api/src/modules/warnings/routes/warning.routes.ts`
- `apps/api/src/modules/warnings/services/warning.service.ts`
- `apps/api/src/modules/warnings/tests/warning.fixtures.ts`
- `apps/api/src/modules/warnings/tests/warning.integration.test.ts`
- `apps/api/src/modules/warnings/tests/warning.model.test.ts`
- `apps/api/src/modules/warnings/validation/warning.schemas.ts`
- `apps/mobile/app/officer/warnings/create.tsx`
- `apps/mobile/src/features/dashboards/officer/api/warningApi.ts`
- `apps/mobile/src/features/dashboards/officer/api/warningWorkflow.test.ts`
- `apps/mobile/src/features/dashboards/officer/components/WarningComponents.tsx`
- `apps/mobile/src/features/dashboards/officer/screens/CreateWarningScreen.tsx`
- `apps/mobile/src/features/dashboards/officer/screens/ReviewWarningScreen.tsx`
- `apps/mobile/src/features/dashboards/officer/screens/warningScreens.test.tsx`
- `apps/mobile/src/features/dashboards/officer/warningForm.test.ts`
- `apps/mobile/src/features/dashboards/officer/warningForm.ts`
- `docs/development/CREATE_WARNINGS.md`

## Manual device follow-up

1. Open a saved HIGH assessment as an officer, select Create Warning, complete required
   fields, review, edit one value, review again, and save. Confirm DRAFT and warning ID.
2. Repeat with CRITICAL. Check long text, keyboard behavior, scrolling, and optional links.
3. Reopen LOW and MODERATE assessments: no Create Warning action. Direct navigation to
   the create route with those IDs must show the ineligible message.
4. Try empty/whitespace required fields and invalid media links. Confirm inline errors.
5. Disconnect before saving and confirm the error retains review data for retry.
6. Verify the warning in MongoDB references the existing assessment/report and current
   authenticated officer, with the assessment's final risk and status DRAFT.
