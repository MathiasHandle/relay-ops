# apps/server

Public REST API (Fastify). Authenticates machine clients by verifying JWTs from
`apps/auth` and owns the event ingestion domain logic.

## Current state

Only `GET /health`. `PORT` is read directly from `process.env` (default 3001); there
is no `src/env.ts` yet.

## Layout

- `src/main.ts`: entry.
- Build: tsdown (`tsdown.config.ts`), output `dist/main.js`. Alias `@/*` → `src/*`.

## Rules

- Database access only via `@relay-ops/app-db` (consumed from its `dist`; Turbo builds it first via `^build`).
- Importing `@relay-ops/app-db` validates `APP_DATABASE_URL` and creates the client at import time.
- Never access the auth database. Verify JWTs via the auth JWKS endpoint (check signature, `iss`, `aud`, `exp`, `scope`).
- Derive the organization from the token via `ApiPrincipal`, never from the request body.
- Every read and write must be scoped to the caller's organization.

## Planned scope

- `POST /v1/events` (Zod validation, returns `202` with Event and Delivery ids); idempotency via unique `(organizationId, source, externalId)`.
- `GET /v1/events/:id` or `GET /v1/deliveries/:id` with authorization checks.
- Publish delivery jobs to RabbitMQ, later through a transactional outbox.
