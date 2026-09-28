# Soft Delete Risk Assessments

## Goal and scope

Implement Phase 4 soft deletion for historical risk assessments. A deleted assessment remains in MongoDB with deletion audit fields, disappears from normal application reads, and keeps its operational status and reassessment relationships. Only `CLOSED` assessments are eligible. `ACTIVE` assessments remain operational and cannot be deleted. Preserve any existing `VOID` behavior without adding a Void workflow. Do not implement Monitoring, restoration, hard deletion, or unrelated changes.

## Existing architecture

The monorepo shares API contracts through `@safealert/contracts`. The API uses Express routes, authentication and role middleware, Zod request schemas, a focused service, and a repository interface implemented by Mongoose and in-memory repositories. The Mongo assessment schema currently has an ACTIVE-only partial unique index. Reassessment conditionally closes the current assessment and inserts its successor in one transaction; manual close uses a conditional `ACTIVE` update. The officer mobile feature calls the API through the shared `apiRequest` client.

Normal assessment reads currently use repository `findById`, `findActiveByIncidentId`, and `findHistoryByIncidentId`. Warning creation and attachment upload also depend on assessment `findById`; warning creation additionally requires `ACTIVE`. The result screen loads assessment history and currently offers close/reassess actions for active records. History is newest first. Existing schema fields can be absent on legacy documents, so a missing `isDeleted` must mean not deleted.

## Data and contracts

Add shared controlled reasons: `CREATED_BY_MISTAKE`, `DUPLICATE_RECORD`, `INCORRECT_INFORMATION`, and `OTHER`. Add `isDeleted` with a false default, plus optional `deletedAt`, `deletedById`, `deleteReason`, and `deleteNote` audit fields. Keep deletion separate from status and closure fields. Do not rewrite `previousAssessmentId` references.

The strict request body contains only `deleteReason` and optional `deleteNote`. Trim notes and limit them to 10-500 characters; require a valid note for `OTHER`. Derive deletion actor and timestamp on the server. The response follows the existing lifecycle response pattern and returns the updated assessment.

## API and persistence

Add `PATCH /api/v1/risk-assessments/:assessmentId/delete`, behind the router's existing authentication and `DISASTER_OFFICER` authorization. Validate the ObjectId and strict body. The service verifies existence and eligibility, maps lifecycle/stale conflicts to the project's 409 error convention, and supplies the authenticated officer ID and server time to a focused repository operation.

The Mongoose repository performs a single-document conditional update matching the ID, `CLOSED` status, and not-deleted state (including legacy records where the field is absent). It sets the audit fields and timestamp atomically; it never issues a physical delete. The in-memory repository mirrors eligibility, audit, and concurrency semantics. Normal `findById`, active lookup, and history queries exclude `isDeleted: true`, while preserving legacy documents with no field. Direct retrieval of deleted records therefore behaves as unavailable. Reassessment and close continue to use the normal filtered lookup, and their atomic transitions remain unchanged.

If the conditional update loses a race, the repository/service distinguishes a missing record from an existing record that is already deleted or no longer eligible so the API returns 404 for absence and 409 for stale/ineligible state. Concurrent deletes allow only one successful transition.

## Mobile behavior

Add a typed API helper using the shared API client. On the result screen, show Delete Assessment only for a `CLOSED` assessment. Open a confirmation form with a required reason, optional note for predefined reasons, and required note for `OTHER`; trim and validate before submission. Cancel makes no request. Prevent duplicate submissions, display failures while leaving the record visible, and after success navigate back to the officer assessments screen and refresh history. Deleting a closed historical record must not change the active assessment card. Existing warning actions remain available only for active assessments.

## Verification

Add or update contract/schema, model, Mongoose persistence, in-memory repository, service, route/integration, and mobile API/screen tests. Cover legacy missing fields, strict request ownership, `OTHER` note rules, closed-only eligibility, audit fields, atomic duplicate handling, retained Mongo record and reassessment reference, all normal read filters, ACTIVE assessment and warning regressions, mobile cancellation/loading/error/success, and history refresh. Run the relevant API and mobile test suites plus type-check and lint commands configured by the repository; report pre-existing failures separately.
