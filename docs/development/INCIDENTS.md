# Incident backend foundation

This module supports automatic grouping after a Disaster Officer verifies a report. The
backend creates a new Incident when no related active Incident is found, or attaches the
report to the strongest matching Incident. It does not modify reports or their original
evidence. The explicit create and attach endpoints remain available for administrative
correction; candidate detection remains advisory when called directly.

## API

All endpoints require the existing Bearer authentication and DISASTER_OFFICER role.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/v1/incidents` | HTTP 201 `{ incident }`; creates a new incident from selected VERIFIED reports |
| GET | `/api/v1/incidents/active` | HTTP 200 `{ incidents: [{ incident, reports }] }` for officer assessment selection |
| GET | `/api/v1/incidents/candidates?reportId=:reportId` | HTTP 200 `{ candidates }` for possible related active incidents |
| POST | `/api/v1/incidents/:incidentId/reports` | HTTP 200 `{ incident }`; explicitly attaches one VERIFIED report |
| GET | `/api/v1/incidents/:incidentId/reports` | HTTP 200 `{ incident, reports }` with source evidence |
| GET | `/api/v1/incidents/:incidentId` | HTTP 200 `{ incident }` |

Report verification (`PATCH /api/v1/reports/:reportId/verification` with `action: VERIFY`)
automatically performs grouping and returns `grouping.action` (`CREATED`, `ATTACHED`, or
`ALREADY_ASSIGNED`) together with the resulting Incident.

Creation body:

```json
{ "reportIds": ["abcdef123456789012345601", "abcdef123456789012345602"] }
```

All references must identify existing VERIFIED reports with the same hazard type.
ObjectIds are validated and normalized to lowercase before lookup and duplicate checks.
The request must contain only reportIds. Forged createdById, status, hazardType, location,
timestamps, descriptions, and other unknown fields are rejected with HTTP 400.

The service derives hazardType from the reports, takes location from the first selected
report, sets status ACTIVE, and obtains createdById from request.auth.id. The location is
a representative point, not a centroid or a boundary. Incident stores no report photos,
descriptions, resident identity, severity, or risk score. Reads return reference IDs and
incident metadata; they do not join or duplicate report evidence.

Errors use the shared `{ error: { code, message } }` envelope: 400 validation, 401 missing
or invalid authentication, 403 wrong role, 404 missing resource, and 409 for unverified
reports, mixed hazards (`INCIDENT_HAZARD_MISMATCH`), or active membership conflicts
(`ACTIVE_INCIDENT_EXISTS`). Attach also rejects inactive incidents (`INCIDENT_NOT_ACTIVE`)
and duplicate membership (`REPORT_ALREADY_IN_INCIDENT`). A repeated create request returns
409; it does not create another incident. This API does not yet provide an idempotency-key
replay response.

## Candidate detection

`GET /api/v1/incidents/candidates?reportId=...` requires an existing VERIFIED report.
It searches ACTIVE incidents with the same hazard type, a representative location within
`INCIDENT_MATCH_RADIUS_METERS` (default 500), and at least one member report created within
`INCIDENT_MATCH_TIME_WINDOW_HOURS` (default 2) of the selected report. These are centralized
product heuristics, not official disaster-management standards. The response includes the
incident ID, hazard type, location, report count, earliest/latest member report timestamps,
and backend-computed distance in meters. Results are ordered by distance, then time
proximity. An incident already containing the selected report is excluded. The endpoint
never attaches, merges, or changes reports or incidents.

Candidate results are advisory when requested directly. Automatic verification chooses the
first candidate after backend sorting by distance and time proximity. An authenticated
Disaster Officer may still explicitly attach a VERIFIED report to any ACTIVE same-hazard
incident, even when its location or reporting time falls outside the candidate heuristics.
The attach operation still enforces active membership uniqueness, so one report cannot be
assigned to two ACTIVE incidents.

## Persistence and concurrency

Incident.reportIds is the sole membership source. The partial unique multikey index
`one_active_incident_per_report` on `{ reportIds: 1 }`, filtered to `{ status: 'ACTIVE' }`,
prevents any report ID from appearing in two active incidents. It also handles requests
with different arrays sharing only one reference. The separate array validator prevents
empty or repeated references inside a single incident; multikey uniqueness alone does
not reject repeated values within one document.

The service checks existing active membership for a friendly response, while the repository
maps duplicate-key errors from racing inserts to the same domain conflict. Writes wait for
model initialization. Deployments with automatic index creation disabled MUST provision
the named unique index and location 2dsphere index before accepting incident writes.
MongoDB's behavior is described in its [unique-index documentation](https://www.mongodb.com/docs/manual/core/index-unique/).

Only one Incident document is written, so membership creation needs no multi-document
transaction and does not require changing report records. Existing application endpoints
cannot edit a VERIFIED report's hazard, evidence, or status; the report service only reviews
PENDING reports. If future endpoints allow edits/resolution of verified reports, their
concurrency with incident creation must be designed explicitly, not assumed safe from
a read-then-insert check. Direct database administration is outside API enforcement.

RESOLVED and CLOSED are supported persisted states for future lifecycle work. Such historical
incidents do not reserve ACTIVE membership. This milestone does not expose a way to change
status, remove reports, or merge incidents. Officers can explicitly select several reports
when creating an incident or append one report at a time through the attach endpoint after
reviewing candidates.

## Verification

From the repository root:

```text
npm exec vitest run apps/api/src/modules/incidents/tests
npm run typecheck
npm run lint
```

The API tests use real Express routes, JWT authorization, and in-memory repositories. Model
tests exercise Mongoose validation, serialization, indexes, and duplicate-key translation.
These do not substitute for a real MongoDB index test.

Set INCIDENT_TEST_MONGODB_URI to a dedicated test server before running
`incident.persistence.test.ts` to exercise real concurrent inserts, partial uniqueness,
and geospatial queries. The suite uses and drops only its randomly named
`incident_foundation_test_*` collection. Without that variable, its three tests are skipped.
No new testing dependencies or database credentials are committed.
