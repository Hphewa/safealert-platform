# Risk Assessment History Design

## Goal

Allow a Disaster Officer to retrieve the saved risk assessments for one incident in newest-first order and view that history alongside the existing saved assessment result.

## Existing behavior and constraints

- Risk assessments are attached to incidents and use `ACTIVE`, `CLOSED`, or `VOID` statuses.
- The repository has a partial unique MongoDB index that permits at most one `ACTIVE` assessment per incident. This constraint and the existing create flow remain unchanged.
- The current incident read returns its active assessment. The assessment-by-ID read returns the saved assessment with incident and report context.
- Risk-assessment routes apply authentication and `DISASTER_OFFICER` authorization at the router level.
- Contracts use shared TypeScript response types and object wrappers. The mobile app uses the central `apiRequest` client.

## API and contract

Add `GET /api/v1/risk-assessments/incident/:incidentId/history`. Its shared response type is:

```ts
type RiskAssessmentHistoryResponse = {
  incidentId: string;
  assessments: SafeRiskAssessment[];
};
```

The controller validates `incidentId` with the existing `riskAssessmentIdSchema`. The endpoint remains behind the existing router-wide authentication and `DISASTER_OFFICER` middleware. Route declaration order places the static history route before parameterized incident and assessment-ID routes.

## Service and repositories

The service confirms that the incident exists, then requests all associated assessments. It does not require the incident to be active or its reports to remain verified, and it does not mutate incident or assessment state. A valid incident with no assessments returns an empty array; a missing incident returns the existing `INCIDENT_NOT_FOUND` 404, and a malformed ID returns the existing validation 400.

Add a dedicated history query to `RiskAssessmentRepository`, retaining `findActiveByIncidentId` unchanged. Both repository adapters include every status, filter by incident ID, and return safe contract objects. Results sort by `assessedAt` descending, then assessment ID descending for deterministic ties. Mongo uses the equivalent `_id` secondary sort.

## Mobile behavior

Add a typed history method to the existing officer risk-assessment API module using `apiRequest` and the supplied access token. On `RiskAssessmentResultScreen`, add an Assessment History card after the primary saved assessment content. Each row shows final risk, calculated score, status, assessment time, and assessor ID (or the signed-in officer’s name when the ID matches). An `ACTIVE` row is labeled “Current”; `CLOSED` and `VOID` rows remain distinguishable by status.

History loading, failure, and retry state are independent from the primary result request. The history card displays a local loading indicator, “Unable to load assessment history.” with Retry on failure, and “No assessment history available.” only for a successful empty response. The main saved result and its existing actions remain available in all history states.

## Tests and verification

- Repository tests cover incident filtering, inclusion of all statuses, newest-first ordering with deterministic ties, and empty results for the in-memory adapter; Mongo query behavior is checked through the repository test approach available in this codebase.
- API integration tests cover authentication, role authorization, malformed and missing IDs, populated and empty history responses, and unchanged existing risk-assessment routes and active-assessment uniqueness.
- Mobile API tests cover the history URL, ID encoding, bearer token, and shared response type usage.
- Result-screen tests cover independent loading, successful history, empty history, failure without hiding the assessment, and retry.
- Run relevant API/mobile/contracts tests, type checks, lint, and build checks available in the monorepo.

## Out of scope

No reassessment, assessment update, close, void, delete, new status, monitoring, warning lifecycle, or create-flow changes are included.
