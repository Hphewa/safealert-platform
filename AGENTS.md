# SafeAlert Agent Guide

This file is a short navigation and rules guide. Keep detailed product and architecture context in `docs/`.

## Engineering Rules

- Use TypeScript for application and package source.
- Avoid `.js` source files unless required by tooling or configuration.
- Reuse existing architecture before creating new patterns.
- Do not duplicate authentication systems.
- Do not duplicate role definitions.
- Use `@safealert/contracts` when a type is shared between frontend and backend.
- Mobile must never access MongoDB directly.
- REST API paths use `/api/v1`.
- Backend authorization is mandatory for protected operations.
- Client-side route guards are UX/navigation controls, not the security boundary.
- Never commit secrets.
- Never put backend secrets into `EXPO_PUBLIC_*`.
- Avoid introducing major dependencies without justification.
- Keep route and screen files thin.
- Put business logic in feature and service layers.
- Prefer feature/domain modules on the backend.
- Offline synchronization should eventually be one shared engine.
- Preserve strict role and ownership security.
- Do not modify unrelated features during a task.
- Run relevant type-check, lint, and test commands after changes.
- Explain failures rather than hiding them.

## Project Map

- Product overview: `docs/product/PRODUCT_OVERVIEW.md`
- Architecture: `docs/architecture/ARCHITECTURE.md`
- Development workflow: `docs/development/CONTRIBUTING.md`
