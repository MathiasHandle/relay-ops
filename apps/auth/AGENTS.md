# apps/auth

Standalone, separately deployable JWT issuer using an OAuth2-like client credentials
flow. Not a full OAuth/OIDC server (no Keycloak). Owns its own database.

## Current state

- `OAuthClient` model (table `oauth_client`) with a seed (`prisma/seed/index.ts`);
  secrets hashed with argon2. Seed clients have fixed `id`s (the JWT `sub`), referenced
  by the app-db seed; do not change them. Seed clients: `acme-app` and `globex-app`
  (`events:read` + `events:write`), `acme-reader` (`events:read` only).
- `POST /oauth/token`: client credentials, issues stateless JWT access tokens.
- `GET /.well-known/jwks.json`: public signing key (`keys` module).
- `GET /health`, CORS allowing `https://hoppscotch.io` (manual API testing).

## Layout

- `src/main.ts`: composition root, `buildApp()` + `listen`.
- `src/app.ts`: `buildApp()`: Zod compilers, global error/404 handlers, CORS, formbody,
  `onClose` (Prisma disconnect), module registration with prefixes.
- `src/config/env.ts`: Zod env schema (`AUTH_DATABASE_URL`, `PORT` default 3002,
  `JWT_PRIVATE_KEY_PATH`, `JWT_ISSUER`, `JWT_AUDIENCE`).
- `src/shared/db/prisma.ts`: the shared `prisma` instance (PrismaPg adapter). Use it, do not create other clients.
- `src/shared/errors/error-handler.ts`: global error handler (5xx logged, generic message) and 404 handler.
- `src/modules/health/`: `GET /health`.
- `src/modules/keys/`: loads the signing key once (`loadSigningKey`), serves the JWKS
  (outside the `/oauth` prefix).
- `src/modules/oauth/` (prefix `/oauth`): built on `@node-oauth/oauth2-server` with an own
  Fastify adapter (`oauth.adapter.ts`). The library drives the flow and calls our model
  (`oauth.model.ts`): `getClient` (DB lookup + argon2) → `validateScope` →
  `generateAccessToken` (JWT via jose) → `saveToken`. OAuth errors are mapped to
  RFC 6749 §5.2 responses in `oauth.error-handler.ts`. Allowed scopes:
  `CLIENT_SCOPES` from `@relay-ops/contracts`.
- `src/test/`: `global-setup.ts` (`_test` guard, DB reset, throwaway signing key),
  `create-test-client.ts` (client with random `clientId` and known secret), `http.ts`.
- `vitest.config.ts`: loads `.env.test` before `src/config/env.ts` is imported; projects
  `unit` and `integration`.
- `prisma/schema.prisma`: generator output `prisma/.generated` (gitignored, ignored by ESLint and Prettier).
- `prisma/migrations/`: auth migrations, run only against the auth DB.
- `prisma.config.ts`: loads `.env` via dotenv, configures the seed.
- `tsconfig.json`: `noEmit`, alias `@/*` → `src/*`; also type-checks `prisma/seed`, `prisma.config.ts` and `tsdown.config.ts`.
- Build: tsdown (`tsdown.config.ts`), output `dist/main.js`; the generated Prisma client is bundled in, the generated client import stays relative (`prisma/.generated` is outside `src/`).

## Rules

- Database: `postgres-auth`, `localhost:5432/relay_ops_auth`, env `AUTH_DATABASE_URL`.
- May import Prisma directly (the Prisma import restriction is disabled here).
- Must never import `@relay-ops/app-db` or access the app database.
- Never log or return client secrets or private keys.
- Routes and the model never build OAuth error bodies; the model returns `false`,
  oauth2-server throws `OAuthError`, the error handler formats it.
- Access tokens: EdDSA JWT (RFC 9068, `typ: at+jwt`), stateless, never stored.
  Lifetime only in `ACCESS_TOKEN_LIFETIME_SECONDS`.
- The signing key lives in `keys/` (gitignored), path from `JWT_PRIVATE_KEY_PATH`.
- SQL added by hand to a migration (CHECK constraints etc.) must be noted in
  `schema.prisma` with a short comment, e.g. `// check (price >= 0)`.

## Testing

- Setup: `docker compose up -d`, copy `.env.test.example` to `.env.test`, run
  `pnpm test:integration`. The database `relay_ops_auth_test` (same `postgres-auth`
  container) is created by `prisma migrate reset` on the first run.
- The global setup generates a throwaway Ed25519 key into `.tmp/` (gitignored); tests
  never use the real signing key.
- Env set in the shell overrides `.env.test` (CI passes env directly).

## Planned scope

- Timing-safe client lookup (dummy hash when the client does not exist).
- Later: `/oauth/revoke`, `/oauth/introspect`; users, login and sessions for the dashboard.
