# apps/server

Public REST API (Fastify). Authenticates machine clients by verifying JWTs from
`apps/auth` and owns the event ingestion domain logic.

## Current state

- `GET /health` (public), CORS allowing `https://hoppscotch.io` (manual API testing).
- `/v1` scope: JWT verification via JWKS (`authenticate`), scope checks (`requireScopes`).
- `GET /v1/me` (any valid token), `POST /v1/events` (`events:write`), idempotent by `externalId`.
- Swagger UI at `/docs`.

## Layout

- `src/main.ts`: composition root, `buildApp({ logger: true })` + `listen`.
- `src/app.ts`: `buildApp({ logger })`: Zod compilers, global error/404 handlers, CORS,
  `onClose` (Prisma disconnect), module registration with prefixes.
- `src/config/env.ts`: Zod env schema (`PORT` default 3001). `APP_DATABASE_URL` is
  validated by `@relay-ops/app-db`.
- `src/shared/auth/`: `authenticate` (`onRequest` on `/v1`, sets `request.principal`),
  `requireScopes` (route-level `onRequest`, all listed scopes required),
  `sendAuthError` + `authErrorResponseSchema` (RFC 6750 401/403).
- `src/shared/errors/error-handler.ts`: global error handler (5xx logged, generic message) and 404 handler.
- `src/shared/errors/error-response.ts`: `domainErrorResponseSchema` for module domain errors.
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
- A route that needs a scope sets `onRequest: requireScopes([...])` with `CLIENT_SCOPES`
  from `@relay-ops/contracts`; document 401/403 with `authErrorResponseSchema`.
- Domain errors extend the module's base error and carry a `code` from its `as const`
  code map; services never set HTTP status. The module error handler maps code → status
  (`Record<Code, number>`, so every code needs a status) and rethrows anything else to
  the global handler. Document these responses with `domainErrorResponseSchema`.

## Testing

- Vitest; test projects and file patterns are defined in `vitest.config.ts`.

## Planned scope

- `GET /v1/events/:id` or `GET /v1/deliveries/:id` with authorization checks.
- Publish delivery jobs to RabbitMQ, later through a transactional outbox.
