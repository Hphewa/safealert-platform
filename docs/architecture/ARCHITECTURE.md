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
      | future database access
      v
MongoDB / MongoDB Atlas

packages/contracts
  Shared TypeScript roles, statuses, and other API-safe contracts
```

## Monorepo Layout

- `apps/mobile`: the single SafeAlert mobile app used by all roles.
- `apps/api`: the REST backend and future security boundary.
- `packages/contracts`: shared TypeScript constants and types used by mobile and backend.
- `docs`: product, architecture, and team workflow documentation.

## Mobile Boundary

The mobile application uses Expo Router for navigation. Route files in `apps/mobile/app` should stay thin and mostly compose screens. Feature logic should live under `apps/mobile/src/features`, shared API calls under `apps/mobile/src/services/api`, and reusable UI under `apps/mobile/src/components/ui`.

The mobile app must never connect directly to MongoDB.

## REST API Boundary

The backend owns server-side behavior and future protected operations. Public and protected routes should use `/api/v1/...`.

The current foundation exposes only:

```text
GET /api/v1/health
```

Future feature APIs should be added inside domain modules such as `reports`, `field-confirmations`, `warnings`, `response-requests`, and `sync`.

## MongoDB Boundary

MongoDB and MongoDB Atlas are planned for later. Location data should eventually use GeoJSON and `2dsphere` indexes. The database should store media metadata and URLs, not large image binaries in normal report documents.

## Authentication And RBAC

SafeAlert should have one shared authentication system. Authentication answers who the user is; authorization answers whether that user may perform an action.

Important future rules:

- Backend authorization is the security boundary.
- Client route protection is only a UX/navigation control.
- Public registration should default to Resident unless a verified administrative process creates privileged roles.
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
- Validate and authorize protected backend operations.
- Keep role strings centralized in `@safealert/contracts`.
- Do not trust mobile-only checks for authorization.
