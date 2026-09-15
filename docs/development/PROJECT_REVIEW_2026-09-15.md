# SafeAlert project review — 15 September 2026

## Overall assessment

SafeAlert has a sound project structure and several real, connected features. It is an early working prototype with substantial work still needed to complete the disaster response process. It is not ready to be relied on for real emergency operations.

The main problem is uneven completion: residents can submit information, volunteers can read reports, and officers can review reports, but several later steps still stop at placeholder screens. A finished-looking screen does not necessarily mean its information comes from the server.

This is a code and automated-check review, not a live operational certification. No percentage of completion is assigned because the project has no agreed, measurable release checklist.

## Scope and limits

- Inventory at the start: 184 tracked files, including 140 TypeScript files, 16,353 physical TypeScript lines, and 23 empty `.gitkeep` markers.
- Reviewed application source, route files, tests, shared contracts, configuration, documentation, and repository organization. Backend and mobile were reviewed separately, with important findings checked again during consolidation.
- The dependency lockfile was checked structurally: 908 package entries, registry resolutions using the npm registry, and integrity values present for resolved non-link entries. This does not establish that dependencies have no vulnerabilities.
- Third-party dependency source, Git history, generated files, and secret environment values were outside the exhaustive source review. Selected installed Expo definitions were inspected to compare them with local declarations.
- Confirmed that local API and mobile `.env` paths are ignored by Git and are absent from the current tracked-file inventory. This does not prove that no secret ever existed in Git history.
- No live MongoDB connection, real account, real report, phone, simulator, push notification service, or deployment was exercised.
- Application code was not changed. The build generated ignored API output; this report is the only intended tracked-file addition.

## What each part does

| Part | Simple explanation | Assessment |
| --- | --- | --- |
| `apps/mobile` | The phone app that people use | Several real flows mixed with sample dashboards and unfinished destinations |
| `apps/api` | The server that checks permissions and handles data | Organized, tested core modules; important session defects remain |
| `packages/contracts` | Shared names and message formats used by both app and server | Useful central foundation; a few mobile types still repeat shared definitions |
| `docs` | Product plans and developer instructions | Helpful structure, but implementation status is outdated |

## Feature progress

“Implemented” below means the code is connected to an API or other real capability. It does not mean that every device and production environment has been tested.

| Feature | Present now | Still needed |
| --- | --- | --- |
| Registration and login | Shared authentication; public registration produces residents; passwords are hashed | Fix disabled-account and refresh behavior; improve abuse protection |
| Role navigation | Separate protected areas for all four roles | Complete the workflows inside those areas |
| Resident hazard reporting | Hazard type, description, severity, GPS, review, API submission, confirmation | Upload selected photos, durable drafts, report history and live status |
| Emergency assistance requests | Detailed form, validation, GPS, API creation with `NEW` status | Fix unanswered medical-needs handling; assignment, responder retrieval, priority calculation, progress updates and tracking |
| Volunteer report browsing | Incoming and nearby pending reports, location-based distance search, details | Save field confirmations, observations and evidence |
| Officer report review | Pending list, details, verify/reject, rejection reason, audit information | Actual report grouping, more-information requests, risk assessments, warnings and monitoring |
| Responder work | Dashboard and sample requests | Actual assigned requests, dispatch, arrival, work progress and completion |
| Photos | Camera/library selection and local preview | Upload and shared access to evidence |
| Location | GPS capture and server geospatial queries | Live map experience and response navigation |
| Alerts and warnings | Navigation and planned module locations | Publishing, device registration and notification delivery |
| Offline use | Drafts survive some navigation while the app stays open | Persistent local storage, a shared retry queue and duplicate prevention |

## Most important findings

### 1. High: disabling an account does not stop session renewal

New login checks `isActive`, but refresh and current-user lookup receive a user representation that omits it. Protected route authentication trusts the existing signed token.

**Impact:** someone whose account is disabled can keep renewing their session. This is more serious than an already-issued token remaining usable briefly until expiry.

**Evidence:** `apps/api/src/modules/auth/services/auth.service.ts:63`, `apps/api/src/modules/auth/repositories/mongooseAuth.repository.ts:47`, and `apps/api/src/middleware/authenticate.ts:23`.

**Verification:** an isolated check registered an in-memory user, disabled the account, and successfully refreshed its session. No live database was used. The production repository has the same missing active-account check.

**Next step:** enforce account activity on refresh and protected access according to a clear revocation policy; cover disabling an already-logged-in user with tests.

### 2. High: one refresh token can create two valid sessions at the same time

Refresh reads the old session, revokes it, and creates its successor in separate steps. The database update does not report to the service whether this request actually won the revocation race.

**Impact:** two requests arriving together can both accept the same refresh token, weakening the intended one-use rotation rule.

**Evidence:** `apps/api/src/modules/auth/services/auth.service.ts:63` and `apps/api/src/modules/auth/repositories/mongooseAuth.repository.ts:102`.

**Verification:** two simultaneous calls against the real service and an in-memory repository both succeeded; both resulting tokens could then refresh again. Production concurrency still needs a database-backed regression test.

**Next step:** make consuming the old session conditional and atomic, and issue a successor only for the request that successfully consumed it.

### 3. High product gap: receiving an emergency request does not dispatch help

The response-request API exposes creation only. The responder dashboard reads sample requests, and detail/active/history destinations are placeholders.

**Impact:** a resident can receive a submission confirmation, but the implemented system does not yet connect that request to a real responder workflow. The confirmation establishes storage, not responder assignment or acceptance.

**Evidence:** `apps/api/src/modules/response-requests/routes/responseRequest.routes.ts:15`, `apps/mobile/src/features/dashboards/responder/mockData.ts`, and `apps/mobile/src/features/dashboards/responder/screens/ResponderDashboardScreen.tsx`.

**Next step:** connect request creation to assignment, authorized responder retrieval and updates, then resident tracking.

### 4. Medium: login can stop working while the app remains open

The mobile app refreshes credentials when its authentication provider starts. The API client has no shared refresh-and-retry path for an expired access token.

**Impact:** when the access token expires (15 minutes by default), reports and other protected actions can fail even though the user still appears logged in.

**Evidence:** `apps/mobile/src/features/auth/context/AuthContext.tsx:63` and `apps/mobile/src/services/api/client.ts:33`.

**Next step:** add one coordinated renewal mechanism shared by protected API requests, with safe handling when renewal really fails.

### 5. Medium: temporary startup connection failures erase the saved login

Session restoration catches all errors and clears stored tokens. It does not distinguish a network outage from invalid credentials.

**Impact:** opening the app without a connection can log the user out. This works against the product's disaster/offline goals.

**Evidence:** `apps/mobile/src/features/auth/context/AuthContext.tsx:78`.

**Next step:** distinguish network/server failures from revoked or expired credentials and preserve the appropriate offline state.

### 6. Important missing feature: photos are not delivered with reports

The phone can select a photo and show it in the review screen, but the submission payload omits it. The selection screen promises upload during submission, while the review screen says upload is not implemented. Those messages contradict each other.

**Impact:** volunteers and officers do not receive a resident's selected photo through this flow. Resetting the draft after submission also removes its selected-photo state.

**Evidence:** `apps/mobile/src/features/dashboards/resident/screens/ReviewReportScreen.tsx:59` and `:154`, plus `apps/mobile/src/features/dashboards/resident/screens/ReportHazardScreen.tsx:186`.

**Next step:** implement media upload and attach the returned shared reference to the report.

### 7. Important missing feature: resident tracking and offline storage

Resident report history/status destinations are placeholders. Emergency request tracking navigates to the placeholder reports area. Drafts and submission responses are held in React state rather than durable local storage.

**Impact:** users cannot follow the complete review/response lifecycle, and unsent drafts are lost when their provider is destroyed or the app process closes. A retry after the server saved a request but the response was lost can create another request because creation has no idempotency key.

**Evidence:** `apps/mobile/src/features/dashboards/resident/reportDraft.tsx`, `apps/mobile/src/features/dashboards/resident/emergencyAssistanceDraft.tsx`, `apps/mobile/src/features/dashboards/resident/screens/ReportStatusPlaceholderScreen.tsx`, and `apps/mobile/src/features/dashboards/resident/screens/EmergencyRequestSubmittedScreen.tsx:22`.

**Next step:** add ownership-protected tracking APIs and screens, persistent drafts and a shared synchronization queue with duplicate prevention.

### 8. Medium: invalid report IDs become server errors with MongoDB

Controllers check that an ID exists, but not that it is a valid MongoDB identifier. The Mongoose repository attempts to cast it; the generic error handler treats the resulting cast failure as a server error.

**Impact:** a malformed link or ID produces an unexpected-error response instead of a clear invalid-input or not-found response. In-memory tests do not reproduce this database behavior.

**Evidence:** `apps/api/src/modules/reports/controllers/report.controller.ts:54`, `apps/api/src/modules/reports/repositories/mongooseReport.repository.ts:17`, and `apps/api/src/shared/errorMiddleware.ts:47`.

**Verification:** casting a malformed ID through the actual Mongoose model throws `CastError`; this was checked without a live database.

### 9. Dashboard information still includes examples

Resident weather/notification counts, officer summary numbers, volunteer summaries and responder requests include fixed sample values. Some navigation definitions in `mockData.ts` are normal static configuration; their location in that file alone does not make a feature fake.

**Impact:** sample operational information can be mistaken for current conditions. For example, the officer home screen has a fixed pending-report count while its separate report list uses the API.

**Evidence:** the four role `mockData.ts` files and their dashboard screens. `ReviewReportScreen.tsx:16` also fixes its initial connection label to `Online`.

**Next step:** replace operational samples with server data or clearly label them as demonstrations; derive connection status from actual connectivity/request state.

## Additional correctness findings

- **Unanswered medical-needs questions become “No.”** The emergency draft begins with a null medical-assistance choice, validation does not require an answer, and submission uses `requiresMedicalAssistance ?? false`. This can turn missing information into an incorrect negative answer. Require an explicit choice or preserve an agreed unknown state. Evidence: `apps/mobile/src/features/dashboards/resident/emergencyAssistanceDraft.tsx:140`, `:233`, and `apps/mobile/src/features/dashboards/resident/screens/ReviewEmergencyRequestScreen.tsx:71`.
- **Hazard submission has a duplicate-request risk.** Its in-flight guard relies only on rendered React state. Two handler calls before the next render can both proceed; the emergency submission already uses a synchronous ref guard. This fast-tap path was identified by code inspection, not reproduced on a device. Server idempotency is also needed for retries after ambiguous network failures. Evidence: `apps/mobile/src/features/dashboards/resident/screens/ReviewReportScreen.tsx:36` and `apps/mobile/src/features/dashboards/resident/screens/ReviewEmergencyRequestScreen.tsx:42`.
- **“Grouped Reports” is not actual incident grouping.** Each pending report is mapped into its own card with a count of one; related-report counts are also one and volunteer evidence is empty. The real verify/reject workflow is implemented, but the grouping/evidence presentation is ahead of the underlying functionality. Evidence: `apps/mobile/src/features/dashboards/officer/reports.ts:190` and `:254`.
- **Some controls have no completed action.** Officer “Request More Info” changes the selected label without sending a request. Hazard “Adjust Location” has a no-op handler. Emergency “Adjust Location” removes detected coordinates and enters a manual-review state even though manual location selection is unfinished. Evidence: `apps/mobile/src/features/dashboards/officer/screens/OfficerReportReviewScreen.tsx:629`, `apps/mobile/src/features/dashboards/resident/screens/ReportHazardScreen.tsx:339`, and `apps/mobile/src/features/dashboards/resident/screens/EmergencyAssistanceScreen.tsx:256`.

## Strengths

- One mobile app, one backend and one shared authentication system follow the intended architecture.
- Role names and major API contracts are centralized.
- Backend routes enforce role permissions; they do not rely only on hidden buttons or mobile navigation guards.
- Public registration cannot create an officer, volunteer or responder.
- Passwords are hashed, and refresh tokens are stored as hashes on the server.
- Native mobile tokens use Expo SecureStore. The web branch uses browser localStorage and should be reviewed separately if browser use becomes a release target.
- Server validation checks report data, coordinates, emergency contact information, counts and review reasons.
- Server-owned identity, status and audit information are not simply trusted from the client.
- Officer reviews preserve original report evidence and record who reviewed the report and when.
- The production report-review update requires the report still to be `PENDING`, reducing conflicting-review races.
- MongoDB models have geospatial indexes; volunteer responses omit resident identity fields.
- Route files are short, and shared dashboard components avoid repeating much of the layout.
- The existing tests cover useful authorization and validation cases rather than only successful submissions.

## Maintainability and release preparation

1. **Split large screens.** Officer report review and resident emergency/report forms combine substantial presentation, state and behavior. Extract cohesive sections and feature logic as those files change; a large file is a maintenance concern, not automatically a bug.
2. **Use the installed Expo types.** `apps/mobile/src/expo-modules.d.ts` manually declares APIs already provided by installed dependencies. Its accuracy enum differs from the installed declarations. This weakens type checking; it does not by itself prove that runtime GPS accuracy is wrong.
3. **Reuse shared hazard/severity types.** Resident draft types repeat definitions already available in contracts.
4. **Paginate report queries.** Current list/nearby queries have no page size limit. Large report volumes would increase server work, transfer size and phone rendering costs.
5. **Add authentication abuse controls.** No application-level login/registration rate limiting is present. Any external gateway protection was not assessed.
6. **Make production failures observable.** The generic error handler suppresses its console logging in production, and no production error-reporting integration is present in this repository.
7. **Handle failed and slow requests consistently.** The shared API client has no explicit request timeout/cancellation policy.
8. **Update documentation.** README says reporting and verification are absent even though they exist. Architecture notes also describe location as not installed. These statements can confuse the team about progress.
9. **Add automated checks on pushes and pull requests.** `.github` contains only an empty marker; no repository CI workflow is present.
10. **Give tests a clear entry point.** The root has no test script, mobile has no test script, and the API build emits its test files. The default API test run can discover both source and compiled tests after a build, making counts misleading.
11. **Clean up old sessions.** Refresh-session expiry has an ordinary database index, with no TTL cleanup rule. Expired session records can accumulate; expiry is still checked by the service.
12. **Complete accessibility and interface polish.** Some header buttons lack accessible labels, bottom navigation lacks a selected accessibility state, and the shared glyph component renders text abbreviations. These need real-device and assistive-technology review.

## Checks actually performed

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm run typecheck` | Passed for API, mobile and contracts | Current TypeScript compilation checks succeed |
| `npm run lint` | Passed for all workspaces | Current lint rules succeed |
| `npm run build` | Passed | API compilation succeeds; root build has no mobile build script |
| Import built API application under Node 24.19.0 | Passed | Built app module imports in this local environment; no server/database connection was started |
| API source tests: `npm exec vitest run -- src` from `apps/api` | 67 passed in 4 files | Existing API/model tests pass |
| Mobile tests: `npm exec vitest run apps/mobile/src/features/dashboards/officer` | 17 passed in 3 files | Officer helper/state/API tests pass |
| `npx expo install --check` from `apps/mobile` | Passed; dependencies up to date | Installed dependency versions satisfy Expo's compatibility check |
| Isolated auth defect checks | Defects reproduced | Disabled-account renewal and concurrent token reuse need fixes |

There are **84 distinct passing source tests**. An earlier default API test run found 134 tests in 8 files because compiled API tests were also discoverable. The source-only result avoids counting those copies twice.

The passing tests do not cover a complete device journey, actual MongoDB persistence/geospatial operations, mobile session expiry/offline behavior, media upload, push delivery or production deployment. Expo's package check is not a substitute for testing on a phone.

## Suggested order of work

1. Fix server session defects, mobile session expiry/network behavior and unanswered medical-needs handling; add tests that reproduce them.
2. Finish resident report history/status and connect the responder lifecycle to submitted emergency requests.
3. Add photo upload and volunteer field confirmations.
4. Complete officer risk assessment, warnings and notification delivery.
5. Build the shared offline foundation alongside these flows: durable drafts, queued operations and duplicate prevention.
6. Replace sample operational data, add database-backed and complete-device tests, automate checks, and update documentation before release.

For the four-person team, keep resident tracking with the resident owner, field confirmation with the volunteer owner, warnings/risk with the officer owner, and assignment/status handling with the responder owner. Treat authentication, media contracts and offline synchronization as coordinated shared work.

## Simple conclusion

The coding is making real progress. The foundation is organized, and several important features already work at the code/API level. The next milestone should be one complete, tested journey across roles: a resident sends information, another role acts on it, and the resident sees the outcome. Until that chain is complete and session defects are fixed, SafeAlert remains a prototype.
