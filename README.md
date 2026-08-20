# SafeAlert Platform

SafeAlert is a mobile disaster and flood warning, reporting, verification, rescue coordination, and safety alert platform. This repository is currently in the foundation stage: monorepo structure, TypeScript setup, Expo mobile app shell, Express API shell, shared contracts, and project documentation.

## Architecture Overview

SafeAlert uses one React Native mobile app for all roles and one backend API:

```text
React Native + Expo mobile app
  -> REST API /api/v1
  -> Node.js + Express backend
  -> MongoDB later
```

The mobile app must never connect directly to MongoDB. Shared role/status strings live in `@safealert/contracts` so the frontend and backend do not drift apart.

## Technology Stack

- npm workspaces
- TypeScript
- Expo, React Native, Expo Router
- Node.js, Express
- ESLint
- Planned later: MongoDB, Expo Location, maps, image picking, push notifications, SecureStore, SQLite sync

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
npm run api
npm run typecheck
npm run lint
```

`npm run mobile` starts Expo from `apps/mobile`.

`npm run api` starts the Express API in watch mode from `apps/api`.

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

This foundation does not implement authentication, role dashboards, hazard reporting, verification, responder workflows, notifications, maps, media uploads, MongoDB, or offline sync. Those are separate milestones.
