# Disaster Risk Assessment implementation plan

**Goal:** Implement the user's first officer assessment milestone for one verified report.

**Architecture:** Reuse contracts, Express authentication/RBAC, repository injection, ApiError,
and the officer dashboard theme. Risk assessments reference reports and users; report context
is read through ReportRepository. The server alone computes the score and audit fields.

**Specification:** The implementation request in this session; no grouping, reassessment,
warnings, weather integration, maps, or dependency changes.

- [x] Contracts and persistence: shared factor/request/response types, Mongoose model with a
  partial unique ACTIVE index, repository interface, MongoDB and in-memory implementations.
- [x] Backend: strict Zod validation, deterministic scoring, verified-report checks, override
  reason validation, controllers, officer-only routes, injectable app registration.
- [x] Verification: integration coverage for RBAC, report states, forged fields, invalid
  factors, overrides, duplicate/concurrent requests, retrieval, and scoring boundaries.
- [x] Mobile: authenticated API adapter, verified-report entry list, read-only report context,
  factors form, decision step, persisted result, post-verification entry action.
- [x] Final checks: API and mobile tests, workspace typecheck/lint, diff review, manual guide.

## Verification outcome

262 tests passed across 17 files, including an API-client-to-Express workflow. Workspace
typecheck and lint passed. Android Metro/Hermes export passed after keeping shared contracts
in the existing single-file layout. Native device interaction and real MongoDB concurrency
were not exercised; the manual guide records those follow-up checks. Independent read-only
review found no actionable defects.

## Decisions and review focus

- Keep pending report retrieval unchanged; add a verified list and retrieve assessment/report
  context together through the risk API. Missing active assessment returns null, not a 404.
- Risk calculation includes hazardReportId so water scoring uses authoritative hazard type.
- Partial unique index handles racing inserts; translate duplicate key errors to HTTP 409.
- Strict MongoDB ObjectId validation on the new API; tests seed realistic 24-hex report IDs.
- Keep legacy response-request road values unchanged. Assessment road options use the more
  specific PARTIALLY_BLOCKED/FULLY_BLOCKED requested for this domain.
- Decision reason: trimmed, 10–500 characters when supplied, required for overrides.
- Mobile must discard a previous calculation when factors change, prevent repeat submissions,
  ignore stale async results after navigation, and recover from a concurrent duplicate save.
- Scoring is a documented university-project heuristic, not an official disaster formula.
