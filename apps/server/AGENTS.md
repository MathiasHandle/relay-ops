# apps/server

Public REST API (Fastify). Authenticates machine clients by verifying JWTs from
`apps/auth` and owns the event ingestion domain logic.

## Current state

Skeleton only: `GET /health`, env validation, global error/404 handlers, CORS allowing
`https://hoppscotch.io` (manual API testing). No authentication, domain modules or tests yet.
Swagger UI at `/docs`.

## Layout

- `src/main.ts`: composition root, `buildApp({ logger: true })` + `listen`.
- `src/app.ts`: `buildApp({ logger })`: Zod compilers, global error/404 handlers, CORS,
  `onClose` (Prisma disconnect), module registration with prefixes.
- `src/config/env.ts`: Zod env schema (`PORT` default 3001). `APP_DATABASE_URL` is
  validated by `@relay-ops/app-db`.
- `src/shared/errors/error-handler.ts`: global error handler (5xx logged, generic message) and 404 handler.
- `src/shared/swagger/`: `@fastify/swagger` options (OpenAPI spec from Zod schemas via
  `jsonSchemaTransform`, global `bearerAuth`) and `@fastify/swagger-ui` options (UI at
  `/docs`, spec at `/docs/json`). Registered in `app.ts` before all modules, outside `/v1`.
- `src/modules/health/`: `GET /health`.
- Build: tsdown (`tsdown.config.ts`), output `dist/main.js`. Alias `@/*` → `src/*`.

## Rules

- Database access only via `@relay-ops/app-db` (consumed from its `dist`; Turbo builds it first via `^build`).
- Importing `@relay-ops/app-db` validates `APP_DATABASE_URL` and creates the client at import time.
- Never access the auth database. Verify JWTs via the auth JWKS endpoint (check signature, `iss`, `aud`, `exp`, `scope`).
- Derive the organization from the token via `OAuthIdentity` (lookup by `iss` + `sub`),
  never from the request body.
- Every read and write must be scoped to the caller's organization.
- Every route sets `schema.tags` with the tag of its URL resource (e.g. `events` for
  `/v1/events`), listed in `src/shared/swagger`.
  Public routes (no token) set `schema.security: []` to override the global `bearerAuth`.

## Planned scope

- `POST /v1/events` (Zod validation, returns `202` with Event and Delivery ids); idempotency via unique `(organizationId, source, externalId)`.
- `GET /v1/events/:id` or `GET /v1/deliveries/:id` with authorization checks.
- Publish delivery jobs to RabbitMQ, later through a transactional outbox.
