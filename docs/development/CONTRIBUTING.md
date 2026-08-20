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
```

Run the API locally when changing backend behavior:

```bash
npm run api
```

Start the mobile app when changing mobile code:

```bash
npm run mobile
```
