# SafeAlert Architecture

SafeAlert is organized as an npm-workspaces monorepo with one mobile app, one backend API, and one shared contracts package.

```text
apps/mobile
  React Native + Expo + Expo Router
      |
      | REST over /api/v1
      v
apps/api
  Node.js + Express + TypeScript
      |
      | MongoDB via Mongoose
      v
MongoDB / MongoDB Atlas

packages/contracts
  Shared TypeScript roles, statuses, and API-safe contracts
```

## Monorepo Layout

- `apps/mobile`: the single SafeAlert mobile app used by all roles.
- `apps/api`: the REST backend and security boundary.
- `packages/contracts`: shared TypeScript constants and types used by mobile and backend.
- `docs`: product, architecture, and team workflow documentation.

## Mobile Boundary

The mobile application uses Expo Router for navigation. Route files in `apps/mobile/app` should stay thin and mostly compose screens. Feature logic should live under `apps/mobile/src/features`, shared API calls under `apps/mobile/src/services/api`, and reusable UI under `apps/mobile/src/components/ui`.

The mobile app must never connect directly to MongoDB. Authentication tokens are stored with Expo SecureStore.

## REST API Boundary

The backend owns server-side behavior and protected operations. Public and protected routes use `/api/v1/...`.

Current foundation endpoints:

```text
GET  /api/v1/health
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Future feature APIs should be added inside domain modules such as `reports`, `field-confirmations`, `warnings`, `response-requests`, and `sync`.

## MongoDB Boundary

MongoDB stores authentication users and refresh sessions. The backend connects to MongoDB during server startup through `MONGODB_URI`; route handlers should not create direct database connections.

Location data should eventually use GeoJSON and `2dsphere` indexes. The database should store media metadata and URLs, not large image binaries in normal report documents.

## Authentication And RBAC

SafeAlert has one shared authentication system. Authentication answers who the user is; authorization answers whether that user may perform an action.

Current authentication flow:

```text
Register/Login
  -> validate request
  -> find/create User
  -> verify password hash
  -> issue short-lived JWT access token
  -> issue opaque refresh token
  -> store refresh token hash in MongoDB
  -> mobile stores tokens in Expo SecureStore
  -> role-based protected area
```

Access tokens are short-lived JWTs. Refresh tokens are opaque random credentials. The server stores only refresh token hashes, rotates refresh sessions on refresh, and revokes the current refresh session on logout.

Public registration always creates `RESIDENT` users, even if the client submits a privileged role. `COMMUNITY_VOLUNTEER`, `DISASTER_OFFICER`, and `EMERGENCY_RESPONDER` accounts are created through the development seed command locally, and later should be created through a trusted administrative process.

Authentication, RBAC, and ownership are separate concerns:

- Authentication: who are you?
- Authorization/RBAC: what can your role do?
- Ownership/assignment: can you operate on this specific resource?

Important rules:

- Backend authorization is the security boundary.
- Client route protection is only a UX/navigation control.
- Only Disaster Officers should officially verify reports or publish official warnings.
- Ownership and assignment checks are required for private resident resources and responder requests.

## Offline-First Concept

Offline support should be one shared sync engine, not one engine per role. Future queued mutations should cover operations such as `REPORT_CREATE`, `FIELD_CONFIRMATION_CREATE`, `RESPONSE_STATUS_UPDATE`, and `FIELD_UPDATE_CREATE`.

Each queued mutation should include a unique client operation ID or idempotency key so retries do not create duplicates.

## Notifications

Future warnings and response updates should be sent from the Node backend through the Expo Push Service, then FCM/APNs, then devices. The mobile app should register devices later; push sending is not part of this foundation.

## Location And Maps

Future mobile features will use Expo Location and map rendering for hazard reporting, verification, warnings, road conditions, and responder navigation. Location capture and map dependencies are intentionally not installed in this foundation.

## Media Storage

Future incident images should use external object or media storage such as Cloudinary or an S3-compatible service. MongoDB should store metadata and URLs.

## Security Boundaries

- Never commit secrets.
- Never put backend secrets in `EXPO_PUBLIC_*`.
- Store mobile access and refresh tokens only in Expo SecureStore.
- Validate and authorize protected backend operations.
- Keep role strings centralized in `@safealert/contracts`.
- Do not trust mobile-only checks for authorization.
