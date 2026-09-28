# Risk Assessment Manual Close Design

## Goal

Allow an authenticated Disaster Officer to manually close an ACTIVE risk assessment with a controlled reason. Preserve the assessment in history, retain Phase 2 reassessment behavior, and prevent closed assessments from creating warnings.

## Current implementation

- `RiskAssessmentStatus` is `ACTIVE | CLOSED | VOID`.
- `closureReason` currently contains only `REASSESSED`; `closedAt` and `closedById` are already persisted and serialized.
- Phase 2 reassessment conditionally changes the previous assessment to CLOSED and creates a linked ACTIVE assessment in a MongoDB transaction.
- The existing result screen shows history and lifecycle metadata, but currently permits warning creation based on risk level without checking assessment status.
- The assessments list loads the active assessment for each incident and displays “Not assessed” when none exists. The existing history endpoint can distinguish a previously assessed incident without changing the API response model.
- Warning creation checks that the assessment exists and has HIGH or CRITICAL risk, but does not require ACTIVE status.

## Domain and validation

Extend the shared closure-reason domain without renaming or removing `REASSESSED`:

- `REASSESSED` — reserved for the existing reassessment flow.
- `INCIDENT_RESOLVED`
- `HAZARD_NO_LONGER_ACTIVE`
- `MONITORING_COMPLETED`
- `OTHER`

Add `closureNote?: string` to the safe assessment contract and persistence model. When supplied, trim it and enforce the existing 10–500 character reason limits. A note is required when the manual closure reason is `OTHER`; notes remain optional for the predefined reasons. Reassessment records use `REASSESSED` without a manual note.

The strict close request contains only:

```ts
{
  closureReason: 'INCIDENT_RESOLVED' | 'HAZARD_NO_LONGER_ACTIVE' | 'MONITORING_COMPLETED' | 'OTHER';
  closureNote?: string;
}
```

The manual close schema excludes `REASSESSED` and rejects unknown/server-owned fields. The model continues to require `status: CLOSED`, `closedAt`, and `closedById` for reassessed closures. For manual closure reasons, it requires `status: CLOSED`, `closedAt`, and `closedById`; `OTHER` also requires a note. These checks are conditional on the closure reason so legacy CLOSED records without lifecycle metadata remain readable and valid. No manual note is required for `REASSESSED`.

## API and service

Add `PATCH /api/v1/risk-assessments/:assessmentId/close` under the risk-assessment router’s existing authentication and `DISASTER_OFFICER` authorization.

The controller validates the ID and strict close request, takes the officer ID from authenticated request context, and returns HTTP 200 with a focused shared response type:

```ts
{ assessment }
```

The service first loads the assessment to distinguish a missing ID (404 `ASSESSMENT_NOT_FOUND`) from an inactive assessment (409 `ASSESSMENT_NOT_ACTIVE`), then asks the repository to conditionally close it. A lost race also maps to 409 `ASSESSMENT_NOT_ACTIVE`. The close command does not reload incident/report context: closure must not depend on current incident eligibility or linked-report availability, and the result screen already has that context.

Do not require the incident to remain ACTIVE or reports to remain VERIFIED in order to close an existing assessment. Closing records the end of assessment operations and must remain available when incident operations or evidence have changed.

## Persistence and concurrency

Add a focused `closeActiveAssessment` repository operation. Its input contains the manual closure reason, optional note, server timestamp, and authenticated officer ID. The operation must not accept caller-supplied status or reassessment metadata.

The Mongoose repository uses one conditional atomic update matching `_id` and `status: ACTIVE`, setting `status: CLOSED`, `closureReason`, `closedAt`, `closedById`, and the optional `closureNote`. Return the updated safe record, or a no-match result/domain conflict if it is no longer ACTIVE. Translate recognized write conflicts during a close/reassess race to the same lifecycle conflict; do not expose raw database errors. A single document update is sufficient, so manual close does not open a transaction.

The in-memory repository performs the equivalent conditional state change synchronously. Repeated close, close of VOID, close after reassessment, and stale concurrent close must not change data and must conflict. A race between manual close and Phase 2 reassessment can have only one winning lifecycle transition. Preserve the existing partial unique ACTIVE index and all Phase 2 transaction behavior.

## History and incident list

Use the existing history endpoint; do not create a second history mechanism. The serializer exposes the optional `closureNote`, and the existing history row displays it when present alongside its existing closure reason, time, and officer fields. A manual closure remains a normal CLOSED history record; a REASSESSED record remains unchanged.

On the officer incident assessment list, if the active-assessment lookup returns no assessment, query the existing history endpoint for that incident. If history exists, display the latest historical assessment and its status/risk with a history/view action; do not label it “Not assessed” and do not show “ASSESS INCIDENT.” If no history exists, retain current “Not assessed” and create-assessment behavior. A history lookup failure is unknown state and must not enable creation; provide the current list refresh path. Do not change the existing create endpoint’s policy in this phase.

## Mobile close and warning behavior

On the result screen, show CREATE WARNING, REASSESS RISK, and CLOSE ASSESSMENT only for an ACTIVE assessment (CREATE WARNING also retains its HIGH/CRITICAL risk condition). CLOSED and VOID records remain view-only.

Pressing CLOSE ASSESSMENT opens an explicit in-screen confirmation form, following the existing inline publish-confirmation pattern because there is no reusable reason-entry modal. Use the shared assessment radio controls for the three predefined manual reasons and OTHER, plus a notes input. Do not offer `REASSESSED`. Require notes for OTHER and validate supplied notes using the shared limits. Cancel returns to the result view without changing the assessment.

Disable duplicate submissions while the PATCH request is pending. On success, use the server response to update the result screen to CLOSED, clear the form, and refresh history. Show success feedback inline using existing screen styles. On failure, retain the selected reason/note, stay on the screen, and show an error. For `ASSESSMENT_NOT_ACTIVE`, offer a reload of the result so the latest status replaces stale state.

Hide warning creation for non-ACTIVE assessments in both the result screen and the Create Warning screen. The warning service rejects creation unless the referenced assessment is ACTIVE and has an eligible HIGH or CRITICAL final risk. Keep warning attachment upload and later warning lifecycle behavior out of scope.

## Error behavior

- 400: malformed ID, invalid/unknown close field, invalid reason, or invalid/missing `OTHER` note.
- 401 / 403: existing authentication and officer-role middleware behavior.
- 404: assessment does not exist at the initial service lookup.
- 409: assessment is not ACTIVE or a concurrent lifecycle transition wins.
- 503: only where existing storage initialization behavior explicitly maps an index/storage failure; otherwise use the current generic error handling without exposing Mongo details.

## Tests

Add validation tests for allowed manual reasons, `REASSESSED` rejection, strict unknown/server-owned field rejection, note trimming/limits, and `OTHER` requiring a note.

Add repository tests for successful close metadata, optional note, repeated close, VOID close, stale condition, in-memory parity, and concurrent close attempts. Add API tests for authentication/RBAC, malformed/missing IDs, server-owned officer/time fields, valid close response, stale conflict, history retention, and race behavior with reassessment. Preserve Phase 2 tests and the ACTIVE partial-index assertion.

Add mobile tests for ACTIVE-only close/warning actions, confirmation open/cancel, allowed reasons, OTHER note validation, duplicate submit prevention, success state/history refresh, failure state retention, stale reload, closed list presentation, and list lookup failures. Update warning service/screen tests for rejecting closed assessments. Continue running the established risk-assessment and warning regression tests.

## Non-goals and boundaries

- No VOID, delete, edit, reopen, or new-after-close workflow.
- No changes to incident lifecycle, MongoDB Atlas deployment, indexes, dependencies, or authentication.
- No reassessment redesign, warning lifecycle redesign, resident/volunteer/responder behavior, or unrelated UI changes.
- The existing create-assessment API policy remains unchanged; the officer list does not expose a new-assessment action for an incident that already has assessment history but no ACTIVE assessment.

## Assumptions to verify during implementation

- MongoDB `findOneAndUpdate` can return the updated document under the current Mongoose version and repository model injection pattern.
- Existing API error handling can represent the domain conflict without exposing storage details.
- Existing mobile `useAssessmentResource.reload()` is suitable for refreshing stale result state after a close conflict.
- Looking up history only when an incident has no active assessment is acceptable for the current incident list size; pagination/query optimization is outside this phase.
