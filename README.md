# SafeAlert Platform

SafeAlert is a mobile disaster and flood warning, reporting, verification, rescue coordination, and safety alert platform. This repository is currently in the foundation stage: monorepo structure, TypeScript setup, Expo mobile app shell, Express API shell, shared contracts, authentication/session/RBAC foundation, and project documentation.

## Architecture Overview

SafeAlert uses one React Native mobile app for all roles and one backend API:

```text
React Native + Expo mobile app
  -> REST API /api/v1
  -> Node.js + Express backend
  -> MongoDB
```

The mobile app must never connect directly to MongoDB. Shared role/status strings live in `@safealert/contracts` so the frontend and backend do not drift apart.

## Technology Stack

- npm workspaces
- TypeScript
- Expo, React Native, Expo Router
- Node.js, Express
- MongoDB and Mongoose
- ESLint
- Planned later: Expo Location, maps, image picking, push notifications, SQLite sync

## Repository Structure

```text
safealert-platform/
├── apps/
│   ├── mobile/
│   └── api/
├── packages/
│   └── contracts/
├── docs/
│   ├── architecture/
│   ├── product/
│   └── development/
├── .github/
├── AGENTS.md
├── .env.example
├── .gitignore
├── eslint.config.mjs
├── package.json
├── README.md
└── tsconfig.base.json
```

## Prerequisites

- Node.js 22.13 or newer
- npm 11 or newer
- Expo Go or a simulator/emulator for mobile development

## Installation

```bash
npm install
```

## Development Commands

```bash
npm run mobile
npm run mobile:android
npm run api
npm run typecheck
npm run lint
npm --workspace @safealert/api test
```

`npm run mobile` starts Expo from `apps/mobile`. For the Android emulator, start the `Pixel_7a` AVD in Android Studio and run `npm run mobile:android` from the repository root. This opens the Expo app on the emulator.

`npm run api` starts the Express API in watch mode from `apps/api`.

The API requires `apps/api/.env` with `MONGODB_URI`, JWT secrets, and token expiration settings. The mobile app reads `EXPO_PUBLIC_API_URL` from `apps/mobile/.env`; treat that value as public/client-visible. For an Android emulator, use `http://10.0.2.2:4000/api/v1` to reach the API running on the host computer. For a physical device, use the computer's LAN IP instead.

The API health endpoint is:

```text
GET http://localhost:4000/api/v1/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## Documentation

- `docs/product/PRODUCT_OVERVIEW.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/development/CONTRIBUTING.md`

## Current Scope

This foundation includes authentication/session/RBAC setup and temporary protected role home placeholders. It does not implement hazard reporting, verification workflows, responder request management, notifications, maps, media uploads, or offline sync. Those are separate milestones.
