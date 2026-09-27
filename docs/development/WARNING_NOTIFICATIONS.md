# LDFEW-127: Targeted push/SMS for a published HIGH/CRITICAL warning

## Implemented behavior

Publication is unchanged. The existing officer flow still saves a DRAFT warning and publishes
it through `POST /api/v1/warnings/:warningId/publish`. LDFEW-127 only adds what happens after
the database records `status = PUBLISHED`:

```
DRAFT warning -> officer confirms publication -> warning persisted as PUBLISHED
  -> read persisted riskLevel and notificationTarget
  -> resolve active RESIDENT recipients from the database
  -> SMS through Notify.lk  +  PUSH through Firebase Cloud Messaging
  -> one delivery record per resident and channel
```

- `LOW` and `MODERATE` warnings send nothing. Notification is limited to the persisted
  `HIGH`/`CRITICAL` risk level, and the service refuses any warning whose persisted status is
  not `PUBLISHED`.
- Notification starts only after the publication write succeeds. `WarningService.publish`
  returns the persisted warning first and only then invokes the post-publication handler.
- Notification failure never rolls back publication. The handler is fire-and-forget, every
  recipient and channel attempt is isolated, and the notification service never throws.
- Recipients come from the database. No recipient ID, phone number, push token, or target is
  accepted from the client, and the warning module keeps its existing strict publish schema.

## Trigger location

- `apps/api/src/modules/warnings/services/warning.service.ts` already exposed the
  `WarningPublishedHandler` hook; it is unchanged.
- `apps/api/src/app.ts` supplies the handler when the caller does not provide one:
  `warningNotificationService.notifyPublishedWarning(warning)`.
- Orchestration lives in
  `apps/api/src/modules/notifications/services/warningNotification.service.ts`.

## Target resolution

The persisted `warning.notificationTarget.scope` selects the recipient query
(`notificationTargeting.ts`). The contract name for the country-wide scope is `WHOLE_COUNTRY`
(the brief's `COUNTRY`).

| Scope | Recipient query |
| --- | --- |
| `AFFECTED_AREA` | active `RESIDENT` users whose normalized `area` equals the normalized `warning.affectedArea` |
| `DISTRICT` | active `RESIDENT` users whose normalized `district` equals the normalized selected district |
| `WHOLE_COUNTRY` | active `RESIDENT` users whose normalized `country` equals the configured country, plus residents who never recorded a country |

Only `User.role = RESIDENT` and `User.active = true` (`isActive: true`) are ever returned.
Mongoose and the in-memory repository implement the same rule, and both forms are asserted in
tests.

Location values are normalized identically on write and on match: trimmed, NFKC-normalized,
lowercased, and stripped of non-letter/non-number characters (Unicode-aware, so Sinhala and
Tamil names still match). `Riverside-Village` and `riverside village` therefore match, and the
notification profile endpoint stores the normalized form.

## SMS provider: Notify.lk

`providers/notifyLkSmsProvider.ts` implements the official endpoint
`POST https://app.notify.lk/api/v1/send` with `user_id`, `api_key`, `sender_id`, `to`, and
`message`. POST with a form-encoded body is used so the API key never appears in a URL.
Twilio is deliberately not implemented; `SMS_PROVIDER` accepts `notifylk` (default) and `mock`.

Recipient numbers are normalized to the Notify.lk `9471XXXXXXX` format before sending
(`utils/phoneNumber.ts`). `+94771234567`, `0094771234567`, `94771234567`, `0771234567`, and
`771234567` all normalize to the same value; an already normalized number is never given a
second country code. Landlines, malformed numbers, and missing numbers are not sendable.

Response handling follows the Notify.lk documentation instead of assuming HTTP 200 means
success:

- `{"status":"success","data":"Sent"}` -> `SENT`, `provider = NOTIFY_LK`,
  `providerStatus = "Sent"`, plus `providerMessageId` when a `uid` is returned.
- Any other body (for example `{"status":"error","code":"100","message":"Invalid API KEY"}`),
  a non-JSON body, or a non-2xx status -> `FAILED` with a sanitized `errorCode` and
  `errorMessage`.

`NOTIFICATION_SMS_MOCK_ENABLED=true` (or `SMS_PROVIDER=mock`) selects `MockSmsProvider`, which
records the attempt without contacting any provider. An unknown `SMS_PROVIDER` value resolves
to an unconfigured Notify.lk provider, so deliveries are recorded as `SKIPPED` rather than
being sent through the wrong integration.

## Push provider: Firebase Cloud Messaging

`providers/fcmPushProvider.ts` sends through the FCM HTTP v1 API
(`POST https://fcm.googleapis.com/v1/projects/:projectId/messages:send`). The backend
authenticates with a service account (JWT bearer assertion -> OAuth2 access token), caches the
access token until shortly before expiry, and maps the FCM error status (`UNREGISTERED`,
`INVALID_ARGUMENT`, ...) into the delivery record.

No Firebase Admin SDK dependency is added: the module is dependency-free and uses the Node
`crypto` and `fetch` APIs the repository already relies on. The wire protocol is the same as
`admin.messaging().send()`, so swapping in `firebase-admin` later is a single-file change
behind the `PushProvider` interface.

The `User.pushToken` field stores the device token. It is never returned by auth responses and
is excluded from queries unless explicitly selected.

Push payload built from the persisted warning:

```
notification: { title: "SAFEALERT - [RISK LEVEL] WARNING", body: "[affected area]\n[message]\n[required action]" }
data: { warningId, riskLevel, affectedArea }
```

## Delivery records and idempotency

`models/warningDelivery.model.ts` stores one record per `warningId + recipientId + channel`
with a unique compound index. Each record holds `channel`, `status`, `provider`,
`providerMessageId`, `providerStatus`, `skipReason`, `errorCode`, sanitized `errorMessage`,
`sentAt`, and timestamps. No credential or raw provider payload is ever stored.

| Situation | Recorded result |
| --- | --- |
| SMS sent by Notify.lk | `SENT` / `NOTIFY_LK` |
| Resident has no sendable phone number | `SKIPPED` / `INVALID_OR_MISSING_PHONE` |
| Notify.lk not configured | `SKIPPED` / `PROVIDER_NOT_CONFIGURED` |
| Notify.lk error or transport failure | `FAILED` + sanitized code/message |
| Push sent by FCM | `SENT` / `FCM` |
| Resident has no push token | `SKIPPED` / `MISSING_PUSH_TOKEN` |
| Firebase not configured | `SKIPPED` / `PROVIDER_NOT_CONFIGURED` |
| FCM error | `FAILED` + sanitized FCM status |

Before a channel is attempted the service looks up the existing record. A previous record
(sent, failed, or skipped) prevents a second provider call, so triggering publication twice
cannot send a duplicate SMS or push. The unique index is the database-level guarantee even if
two attempts race.

Failure isolation example: resident A `SMS = SENT / PUSH = SENT`, resident B
`SMS = FAILED / PUSH = SENT`, resident C `SMS = SKIPPED / PUSH = FAILED` — all six records are
written independently and the warning stays `PUBLISHED`.

Zero eligible recipients writes no records, logs the target, and returns an empty summary; the
warning stays `PUBLISHED`.

## Notification profile API

`GET /api/v1/notifications/profile` and `PUT /api/v1/notifications/profile` (authenticated,
own profile only) let the mobile app register or refresh its FCM device token and its contact
details (`area`, `district`, `country`, `phoneNumber`, `pushToken`). The schema is strict:
identity, role, targeting, and timestamp fields are rejected. An empty string or `null` clears
a stored value (for example a stale push token). Credentials are never accepted, returned, or
logged.

## Environment variables

Backend only, in `apps/api/.env`. The `.env.example` files contain empty placeholders only.

```text
SMS_PROVIDER=notifylk
NOTIFICATION_SMS_MOCK_ENABLED=false
NOTIFY_LK_USER_ID=
NOTIFY_LK_API_KEY=
NOTIFY_LK_SENDER_ID=NotifyDEMO
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_SERVICE_ACCOUNT_PATH=
NOTIFICATION_COUNTRY_NAME=Sri Lanka
```

## Real Notify.lk SMS test

1. Put your own Notify.lk values in `apps/api/.env` (never in source or chat):
   `NOTIFY_LK_USER_ID`, `NOTIFY_LK_API_KEY`, and `NOTIFY_LK_SENDER_ID=NotifyDEMO` for testing.
2. Keep `SMS_PROVIDER=notifylk` and `NOTIFICATION_SMS_MOCK_ENABLED=false`, then run
   `npm run api`.
3. Register or sign in as a resident and store a real Sri Lankan mobile number and area through
   `PUT /api/v1/notifications/profile` (for example `phoneNumber: "0771234567"`,
   `area: "<the officer's affected area text>"`).
4. As an officer, publish an existing HIGH or CRITICAL warning with
   `notificationTarget: { scope: "AFFECTED_AREA" }` for the same area.
5. Confirm the SMS arrives, then confirm MongoDB `warningdeliveries` contains one SMS record
   with `status: SENT`, `provider: NOTIFY_LK`, and no credential values.

## Real FCM test

1. Create a Firebase project, add an Android app with the SafeAlert package name, and download
   `google-services.json` for the mobile build (never committed).
2. Generate a service account with the Firebase Cloud Messaging API enabled, place its JSON file
   outside source control, and point `FIREBASE_SERVICE_ACCOUNT_PATH` at it in `apps/api/.env`
   (or set the three `FIREBASE_*` values).
3. Restart the API. With credentials present, push deliveries are attempted instead of
   `SKIPPED / PROVIDER_NOT_CONFIGURED`.
4. Device token capture requires `npx expo install expo-notifications` plus a development build
   (Expo Go cannot receive remote push notifications on SDK 57), then:
   `const token = readDevicePushToken(await Notifications.getDevicePushTokenAsync())` followed
   by `registerPushToken(token, accessToken)`.
5. Publish a HIGH/CRITICAL warning targeting that resident, confirm the push arrives with the
   `warningId`, `riskLevel`, and `affectedArea` data payload, then confirm the PUSH record in
   `warningdeliveries` is `SENT` with `provider: FCM`.

## Tests

Tests mock both providers, so no real Notify.lk or Firebase credentials are needed.

| Test file | Coverage |
| --- | --- |
| `tests/warningNotificationDelivery.test.ts` | HIGH/CRITICAL send SMS + PUSH, LOW/MODERATE and non-published warnings send nothing, all three scopes, active-RESIDENT-only targeting, phone/token skip reasons, unconfigured providers, SENT/FAILED recording, per-recipient and per-channel failure isolation, duplicate prevention, zero recipients, content from persisted data, no credential or contact logging |
| `tests/notifyLkSmsProvider.test.ts` | parameters, documented success body, `uid` mapping, HTTP 200 error bodies, non-JSON and 5xx responses, transport failure, credential redaction |
| `tests/fcmPushProvider.test.ts` | unconfigured provider, signed JWT assertion verification, v1 message body and Authorization header, token caching, escaped newlines, FCM error mapping, auth failure, private-key redaction |
| `tests/notificationTargeting.test.ts` | scope resolution from the persisted warning, matching rules, resident-only filters, unresolved targets, log-safe descriptions |
| `tests/phoneNumber.test.ts` | Sri Lankan mobile normalization and rejection cases |
| `tests/warningNotificationContent.test.ts` | SMS and push content, risk-level title, optional safe routes, 621-character limit |
| `tests/warningDelivery.model.test.ts` | schema refs/enums, unique warning/recipient/channel index, serialization |
| `tests/notificationProfile.integration.test.ts` | profile auth, FCM token registration, forged-field rejection, validation, clearing values, no credential exposure, missing user |
| `tests/publishedWarningNotification.integration.test.ts` | publish triggers SMS + PUSH after the PUBLISHED write, rejected publication notifies nobody, repeat publication sends no duplicate, provider failures keep the warning PUBLISHED, zero recipients do not fail publication |
| `apps/mobile/src/features/notifications/api/notificationApi.test.ts` | GET/PUT profile client, device token registration and clearing, request bodies |
| `apps/mobile/src/features/notifications/pushNotifications.test.ts` | device token extraction and rejection of undeliverable tokens |

## Assumptions and limitations

- Location matching is exact normalized-value matching, not geospatial. A resident receives an
  `AFFECTED_AREA` warning only when the stored area text matches the warning's affected area
  text after normalization. The resident notification profile screen is still a placeholder, so
  profile values are written through the API today.
- `WHOLE_COUNTRY` includes residents who never stored a country, because they are assumed to be
  inside the served country (`NOTIFICATION_COUNTRY_NAME`, default Sri Lanka).
- Real delivery to a physical device was not executed here: automated tests use mock providers
  and a stubbed HTTP client, and no real credentials exist in the repository.
- Firebase Admin SDK is not added as a dependency (see the push provider section); the FCM
  HTTP v1 protocol is implemented directly.
- LDFEW-127 deliberately excludes warning creation, risk assessment, publication redesign,
  cancel/archive, resident acknowledgement, safety guidance, and the LDFEW-132 retry worker.
  There is no automatic retry of a failed delivery.

## Changed files

Modified:

- `packages/contracts/src/index.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/modules/users/models/user.model.ts`
- `apps/api/src/app.ts`
- `apps/api/.env.example`
- `.env.example`

Added (backend, under `apps/api/src/modules/notifications/`):

- `notificationTargeting.ts`, `warningNotificationContent.ts`
- `utils/normalizeLocationValue.ts`, `utils/phoneNumber.ts`, `utils/redactSecrets.ts`
- `providers/notificationProvider.ts`, `providers/smsProvider.ts`, `providers/pushProvider.ts`
- `providers/notifyLkSmsProvider.ts`, `providers/mockSmsProvider.ts`,
  `providers/createNotificationProviders.ts`
- `providers/fcmPushProvider.ts`, `providers/mockPushProvider.ts`
- `models/warningDelivery.model.ts`
- `repositories/warningDelivery.repository.ts`, `repositories/inMemoryWarningDelivery.repository.ts`,
  `repositories/mongooseWarningDelivery.repository.ts`
- `repositories/notificationRecipient.repository.ts`,
  `repositories/inMemoryNotificationRecipient.repository.ts`,
  `repositories/mongooseNotificationRecipient.repository.ts`
- `repositories/notificationProfile.repository.ts`,
  `repositories/inMemoryNotificationProfile.repository.ts`,
  `repositories/mongooseNotificationProfile.repository.ts`
- `services/warningNotification.service.ts`, `services/notificationProfile.service.ts`
- `controllers/notification.controller.ts`, `routes/notification.routes.ts`,
  `validation/notification.schemas.ts`
- `tests/notification.fixtures.ts` and the eight test files listed above

Added (mobile):

- `apps/mobile/src/features/notifications/api/notificationApi.ts` (+ test)
- `apps/mobile/src/features/notifications/pushNotifications.ts` (+ test)

Added (docs):

- `docs/development/WARNING_NOTIFICATIONS.md`



