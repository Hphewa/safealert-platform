# Contributing To SafeAlert

SafeAlert is designed for a four-person university team. Prefer vertical feature ownership while keeping shared infrastructure shared.

## Branch Workflow

- `main` or the existing stable branch should stay stable.
- `develop` can be used as an integration branch if the team chooses that workflow.
- Each feature should be developed on a focused feature branch.

Example feature branches:

- `feature/auth-foundation`
- `feature/resident-reporting`
- `feature/volunteer-confirmation`
- `feature/officer-warning`
- `feature/responder-requests`
- `feature/offline-sync`

## Recommended Steps

1. Pull the latest integration branch.
2. Create a feature branch.
3. Implement a focused task.
4. Run relevant checks.
5. Inspect the Git diff.
6. Commit.
7. Push.
8. Open a pull request.
9. Ask another member to review.
10. Merge after review.

Do not automatically create remote branches or push from setup tasks unless the team explicitly asks for that.

## Four-Person Ownership

Member 1, Resident:

- Resident mobile flow
- Report creation
- Resident report tracking
- Location/media integration related to resident reporting

Member 2, Community Volunteer:

- Nearby reports
- Field confirmation
- Volunteer observations and evidence

Member 3, Disaster Officer:

- Report verification
- Risk assessments
- Warnings
- Notification orchestration

Member 4, Emergency Responder:

- Priority requests
- Request acceptance
- Status updates
- Responder field updates
- Offline sync integration

## Shared Infrastructure

Keep these shared:

- Authentication
- User model
- Role contracts
- API client
- Shared UI primitives
- Sync engine

Do not duplicate shared infrastructure per role. When a type crosses the frontend/backend boundary, add it to `@safealert/contracts`.

## Local Checks

Run these before opening a pull request:

```bash
npm run typecheck
npm run lint
npm --workspace @safealert/api test
```

Run the API locally when changing backend behavior:

```bash
npm run api
```

Start the mobile app when changing mobile code:

```bash
npm run mobile
```

## Authentication Development Setup

The API requires local environment variables in `apps/api/.env`:

```text
PORT
NODE_ENV
MONGODB_URI
JWT_ACCESS_SECRET
JWT_ACCESS_EXPIRES_IN
JWT_REFRESH_SECRET
JWT_REFRESH_EXPIRES_IN
```

Use local secret values only. Never commit `.env`.

The mobile app reads its API URL from `apps/mobile/.env`:

```text
EXPO_PUBLIC_API_URL
```

`EXPO_PUBLIC_*` values are visible in the client app, so do not put secrets there. On a physical phone, `localhost` points to the phone itself, not your development computer. Use your computer's LAN IP address for device testing, for example `http://192.168.1.20:4000/api/v1`.

Public registration creates `RESIDENT` accounts only. To create local development accounts for privileged roles, set local seed passwords in `apps/api/.env`:

```text
SEED_VOLUNTEER_PASSWORD
SEED_OFFICER_PASSWORD
SEED_RESPONDER_PASSWORD
```

Then run:

```bash
npm --workspace @safealert/api run seed:auth-dev
```

The seed script refuses to run in production and requires passwords with at least 8 characters.
