# Disaster Risk Assessment

This milestone creates one ACTIVE official assessment for one ACTIVE Incident with verified reports. All endpoints
require an authenticated DISASTER_OFFICER. No dependencies or Expo versions were changed.

## Request flow

Verified Reports -> Incident Grouping -> Incident -> Assess Risk -> Calculate -> Suggested Risk -> Final Decision -> Save -> Result.

The officer opens Assessments after grouping verified reports into an Incident.
The create route takes `incidentId`, retrieves the Incident and all linked reports,
and displays that evidence as read-only context. The form never derives official severity from
the resident's Reported Severity. Calculation and decision are two steps of the same route;
editing factors discards the preview. Saving sends factors and a final decision only.
The result route fetches persisted state by assessment ID, including on direct navigation.

## API

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/v1/reports/officer/verified` | `{ reports }` |
| POST | `/api/v1/risk-assessments/calculate` | `{ calculatedScore, systemSuggestedRisk }` |
| POST | `/api/v1/risk-assessments` | HTTP 201 `{ assessment, incident, reports }` |
| GET | `/api/v1/risk-assessments/:assessmentId` | `{ assessment, incident, reports }` |
| GET | `/api/v1/risk-assessments/incident/:incidentId` | `{ assessment, incident, reports }`; assessment is null if none is active |

Calculation accepts the same factors as creation, including `incidentId`, but without
`finalRiskLevel` or `decisionReason`. The Incident lets the server retrieve the authoritative
hazard type and all linked report statuses. Calculation does not persist anything.

Example create body:

```json
{
  "incidentId": "123456789012345678901234",
  "hazardSeverity": "HIGH",
  "peopleAffected": 80,
  "vulnerablePeople": 12,
  "roadAccessibility": "PARTIALLY_BLOCKED",
  "infrastructureImpact": "MODERATE",
  "waterLevelTrend": "RISING",
  "weatherCondition": "HEAVY_RAIN",
  "finalRiskLevel": "HIGH"
}
```

For a FLOOD Incident this produces score 23, suggested risk HIGH. A different final risk
requires a trimmed reason of 10–500 characters. If a reason is provided when accepting
the suggestion, the same length rules apply. Counts must be safe nonnegative integers;
vulnerable people cannot exceed people affected. IDs on the new API must be 24-hex ObjectIds.

Unknown fields are rejected, including client-provided score, suggestion, officer identity,
role, report status, assessment status, or timestamps. The server checks VERIFIED status
again at save, recalculates risk, derives `assessedById` from authentication, and timestamps
the assessment. Shared ApiError/Zod error handling supplies the existing `{ error: { code,
message } }` envelope. Missing resources are 404, malformed input is 400, wrong role is 403,
ineligible report state and duplicate ACTIVE assessment are 409.

## Scoring assumptions

This is a deterministic university-project heuristic, **not an official government
disaster-risk formula or a validated operational risk model**. All scoring lives in
`apps/api/src/modules/risk-assessments/services/riskCalculation.service.ts`.

| Factor | Points |
| --- | --- |
| Hazard severity | LOW 0; MODERATE 3; HIGH 6; SEVERE 9 |
| People affected | 0: 0; 1–10: 1; 11–50: 2; 51–100: 3; 101–500: 4; over 500: 5 |
| Vulnerable people | 0: 0; 1–5: 1; 6–20: 2; over 20: 4 |
| Road accessibility | ACCESSIBLE 0; PARTIALLY_BLOCKED 2; FULLY_BLOCKED 4; UNKNOWN 1 |
| Infrastructure | NONE 0; LOW 1; MODERATE 3; HIGH 5; SEVERE 7 |
| Water trend, FLOOD only | FALLING/STABLE/NOT_APPLICABLE 0; RISING 3; RISING_RAPIDLY 6; UNKNOWN 1 |
| Weather | CLEAR 0; LIGHT_RAIN 1; MODERATE_RAIN 2; HEAVY_RAIN 4; STORM 6; UNKNOWN 1 |

Sum: 0–7 LOW, 8–15 MODERATE, 16–23 HIGH, 24–41 CRITICAL. Unknown observations add
uncertainty points. Water trend is retained as an observation for other hazards but does
not affect their score. No external weather service is used.

The existing shared RISK_LEVELS is reused. Assessment-specific road options use the requested
PARTIALLY_BLOCKED/FULLY_BLOCKED values; the older response-request LIMITED/BLOCKED contract
remains unchanged. Initial form values are MODERATE severity, NONE infrastructure, and UNKNOWN
road/water/weather; affected-person counts require explicit entry.

## MongoDB relationship and duplicates

`RiskAssessment.incidentId` is an indexed ObjectId ref to `Incident`.
`RiskAssessment.assessedById` is an ObjectId ref to `User`. Report type, description,
coordinates, and resident identity are retrieved through ReportRepository, not copied into
the assessment. The result shows current incident context, not a frozen historical snapshot.

Current automated fixtures use in-memory repositories and no development seed creates
RiskAssessment documents, so those fixtures can be recreated with `incidentId`. No MongoDB
data is deleted or rewritten automatically. If a development database contains former
`hazardReportId` documents or the old index, back it up and run an explicit reviewed
migration before using the new write path.

The migration is available as `npm --workspace @safealert/api run migrate:risk-assessments`.
It is a dry run by default and prints every relationship it would change. Review the output,
resolve any missing or ambiguous report-to-Incident mappings, then rerun with `-- --apply`.
The apply phase preserves assessment IDs, creates `one_active_assessment_per_incident`, and
only then removes the old `one_active_assessment_per_report` index.

If the preview reports `NO_INCIDENT_FOR_REPORT`, use
`npm --workspace @safealert/api run migrate:risk-assessments -- --recover-missing-incidents`
to preview recovery. This creates a separate single-report Incident only when the original
report is still VERIFIED and has valid location/type data and an original assessor. It does
not guess nearby groups or merge official decisions. Review this plan, then append `--apply`.
Every apply writes a BSON-preserving backup under ignored `build/database-backups/` before
changing records. Assessment IDs, factors, scores, decisions and audit fields are preserved.
Restart the API after migration: a failed Mongoose index initialization is cached for the
life of that process. In PowerShell with script execution disabled, use `npm.cmd`.

Two legacy ACTIVE assessments without `incidentId` can prevent the new unique index from
building, blocking all new saves. The obsolete report index can also reject otherwise valid
new incident assessments. These storage failures now return `ASSESSMENT_STORAGE_NOT_READY`
(503), rather than falsely reporting an existing assessment for the selected Incident.

The mobile list isolates assessment lookup failures to the affected Incident and offers
refresh; it never labels a failed lookup as "Not assessed". The decision step shows the
recommendation and manual Final Risk Level selector before evidence summaries. Selecting a
different risk requires a 10–500 character reason. Form controls receive taps while the
keyboard is open.

A partial unique compound index on `{ incidentId: 1, status: 1 }`, filtered to ACTIVE,
prevents concurrent duplicate ACTIVE inserts. The service checks first for a friendly error;
the repository translates MongoDB duplicate-key errors to the same HTTP 409. The repository
awaits model initialization before creating records. Current Mongoose defaults create the
index; deployments that disable automatic index creation must provision
`one_active_assessment_per_incident` before accepting writes. CLOSED/VOID allow future history,
but there are no reassessment/status-update endpoints in this milestone.

## Manual mobile test

1. Configure the existing API environment and MongoDB; start with `npm run api`.
2. Configure `apps/mobile/.env` with `EXPO_PUBLIC_API_URL` pointing to your API's
   `/api/v1` on a host reachable by the phone. Run `npm run mobile` and open Expo Go SDK 57.
3. Create a flood report as a resident. Log in with a seeded Disaster Officer account
   (see CONTRIBUTING.md for existing development account seeding).
4. Open Reports, inspect the report, and VERIFY it. The backend automatically creates or
   joins an Incident, then open the Assessments tab and choose that Incident.
5. Confirm the Incident and all linked verified reports are shown before entering factors.
   A remote HTTP(S) evidence image is previewed when available; local-only media references
   show an unavailable-preview message.
6. Enter HIGH, 80 affected, 12 vulnerable, PARTIALLY_BLOCKED, MODERATE infrastructure,
   RISING water and HEAVY_RAIN. Tap CALCULATE RISK. Expect score 23 and HIGH suggested risk.
7. Select CRITICAL. SAVE ASSESSMENT stays disabled until a reason of at least 10 trimmed
   characters is present. Enter “Hospital access is threatened.” and save.
8. Confirm the result shows saved HIGH suggestion, CRITICAL final risk, factors, reason,
   timestamp and officer identity. Navigate away and reopen via View Risk Assessment.
9. Repeat with a new report and accept HIGH without a reason. Edit factors after calculation
   and confirm a new calculation is required. Try blank/negative/fractional counts and a
   vulnerable count exceeding the total; expect validation errors.
10. Confirm pending/rejected/resolved reports have no Assess Risk action. Try two officer
    sessions assessing the same verified report: the second save must offer the existing
    result. Disable networking to check load, calculation and save errors/retry behavior.

Officer name is shown when the authenticated user's ID matches the saved assessor. Other
officers are shown by ID; this does not add public user-profile lookup or expose user email.

## Automated verification and limits

Run `npm exec vitest run`, `npm run typecheck`, and `npm run lint` at the repository root.
The API integration suite covers RBAC on all five endpoints, each ineligible report state,
forged fields, counts/enums/IDs/reasons, overrides, duplicate requests, references and reads.
Unit tests cover scoring thresholds/count bands and Mongoose constraints/serialization/index
declaration. The MongoDB duplicate-key mapping is tested with a mock; actual database index
concurrency still needs a database-backed test. The mobile suite covers parsing, API error
propagation and an adapter-to-Express workflow using in-memory repositories.

An Android bundle export checks Metro resolution of the new routes and shared contracts:
`npx expo export --platform android --output-dir ../../build/risk-assessment-android`
from `apps/mobile`. This is not a native device interaction test. Follow the manual steps
for keyboard, navigation, evidence preview, and network behavior on a physical device.

Future scope remains deliberately excluded: reassessment/history CRUD,
volunteer confirmation backend, warnings, notifications, offline sync, weather APIs,
automatic escalation, maps and responder workflows. Before operational use, validate/calibrate
the heuristic with domain experts; adding scoring version/history belongs with reassessment.
