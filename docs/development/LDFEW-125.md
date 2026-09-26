# LDFEW-125: Volunteer confirmation or Unable to Confirm

Implemented report details → review → choose outcome → submit → PENDING result.

The review screen reloads the eligible report, shows its location, time, severity,
description and existing photo, and provides two actions. Unable to Confirm requires
one of the shared reason choices; Other also requires a trimmed explanation of up
to 500 characters. Loading, retry, submission errors, and success are handled.
Repeated taps during submission are blocked.

## API and persistence

All paths use `/api/v1/field-confirmations`:

| Method and suffix | Role | Request |
| --- | --- | --- |
| POST `/:reportId/confirm` | COMMUNITY_VOLUNTEER | `{}` |
| POST `/:reportId/unable-to-confirm` | COMMUNITY_VOLUNTEER | `{ reason, reasonDetails? }` |
| GET `/:reportId` | DISASTER_OFFICER | None |

Submissions reuse the existing volunteer report eligibility check: only existing
PENDING reports can be reviewed. The backend obtains volunteerId from the verified
access token. Strict request schemas reject unknown fields, including supplied
volunteerId, reportId and status. Malformed IDs return 400; missing or ineligible
reports return 404. Missing authentication returns 401; incorrect roles return 403.

A separate Mongoose FieldConfirmation collection stores reportId, volunteerId,
outcome, status PENDING, reason/details where applicable, and timestamps. createdAt
is the submission time. The resident report is not modified. There is no migration
of existing reports. The existing officer report-review screen retrieves and displays
confirmations and flags for pending reports, including volunteer attribution,
reason, status and submission time. Officer disposition of confirmations is outside
this story.

LDFEW-126 checklists, field observations and new photo uploads are not included.
Risk assessment and warning workflows are unchanged. No dependencies were changed.

## Files changed

Modified:

- `packages/contracts/src/index.ts`
- `apps/api/src/app.ts`
- `apps/mobile/src/features/dashboards/volunteer/screens/VolunteerReportDetailsScreen.tsx`
- `apps/mobile/src/features/dashboards/officer/screens/OfficerReportReviewScreen.tsx`

Added:

- `apps/api/src/modules/field-confirmations/models/fieldConfirmation.model.ts`
- `apps/api/src/modules/field-confirmations/repositories/fieldConfirmation.repository.ts`
- `apps/api/src/modules/field-confirmations/repositories/inMemoryFieldConfirmation.repository.ts`
- `apps/api/src/modules/field-confirmations/repositories/mongooseFieldConfirmation.repository.ts`
- `apps/api/src/modules/field-confirmations/routes/fieldConfirmation.routes.ts`
- `apps/api/src/modules/field-confirmations/services/fieldConfirmation.service.ts`
- `apps/api/src/modules/field-confirmations/validation/fieldConfirmation.schemas.ts`
- `apps/api/src/modules/field-confirmations/tests/fieldConfirmation.integration.test.ts`
- `apps/mobile/app/volunteer/reports/[reportId]/confirm.tsx`
- `apps/mobile/src/features/dashboards/volunteer/api/fieldConfirmationsApi.ts`
- `apps/mobile/src/features/dashboards/volunteer/confirmation.ts`
- `apps/mobile/src/features/dashboards/volunteer/confirmation.test.ts`
- `apps/mobile/src/features/dashboards/volunteer/screens/VolunteerConfirmationScreen.tsx`
- `apps/mobile/src/features/dashboards/officer/components/OfficerFieldConfirmations.tsx`
- `docs/development/LDFEW-125.md`

## Executed verification

- `npm run typecheck`: passed across API, mobile and contracts. The initial run
  found an exactOptionalPropertyTypes error in the flag request mapping; corrected
  and rerun successfully.
- `npm run lint`: passed across API, mobile and contracts.
- `npm --workspace @safealert/api test`: 5 files, 99 tests passed.
- `npx --no-install vitest run apps/mobile/src/features/dashboards/volunteer/confirmation.test.ts apps/mobile/src/features/dashboards/officer/reports.test.ts`:
  2 files, 17 tests passed.
- `git diff --check`: passed; Git emitted only line-ending conversion notices.

Initial Vitest attempts could not spawn workers inside the sandbox (EPERM); the
successful runs used approved execution outside that restriction.

API integration tests exercise report detail retrieval, both submission paths,
PENDING results, authenticated attribution, officer retrieval, preservation of the
original report, missing/invalid reasons, Other explanation validation, malformed
and missing reports, ineligible report statuses, all non-volunteer roles, missing
authentication and injected identity/status fields. Model validation tests check
reason requirements and the default status. Mobile tests exercise form validation,
both API request mappings, authenticated requests, pending responses and API errors.

Tests use in-memory repositories; live MongoDB persistence and rendered Expo/device
interaction have not been exercised.

## Device acceptance checks still to run

1. Sign in as a volunteer and open a pending report from Nearby or Incoming.
2. Select Confirm in Field, then Confirm Current Situation, then Submit Confirmation.
   Check the success message and PENDING status.
3. Open a pending report again, select Unable to Confirm / Flag Issue, and submit
   without a reason. Check the validation message and absence of a submission.
4. Choose a reason and submit. Check the PENDING result. Also check Other with an
   empty explanation and with a valid explanation.
5. Sign in as an officer and open the report review. Check both submissions in
   Volunteer Confirmations & Flags, including reason, volunteer and timestamp.
6. Check loading/retry and submission errors with the API unavailable.
