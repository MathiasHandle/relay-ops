# apps/auth

Standalone, separately deployable JWT issuer using an OAuth2-like client credentials
flow. Not a full OAuth/OIDC server (no Keycloak). Owns its own database.

## Current state

Fastify app with `GET /health`, CORS allowing `https://hoppscotch.io` (manual API
testing), a Prisma client instance. No models yet.

## Layout

- `src/main.ts`: entry, Fastify setup, `onClose` hook disconnects Prisma.
- `src/env.ts`: Zod env schema (`AUTH_DATABASE_URL`, `PORT` default 3002).
- `src/services/db/index.ts`: exports the shared `prisma` instance (PrismaPg adapter). Use it, do not create other clients.
- `prisma/schema.prisma`: generator output `prisma/.generated` (gitignored, ignored by ESLint and Prettier).
- `prisma/migrations/`: auth migrations, run only against the auth DB.
- `prisma.config.ts`: loads `.env` via dotenv; outside the tsconfig include, hence `/// <reference types="node" />`.
- Build: `tsc` with `rootDir: "."`, output `dist/src/main.js`.

## Rules

- Database: `postgres-auth`, `localhost:5432/relay_ops_auth`, env `AUTH_DATABASE_URL`.
- May import Prisma directly (the Prisma import restriction is disabled here).
- Must never import `@relay-ops/app-db` or access the app database.
- Never log or return client secrets or private keys.

## Planned scope

- `OAuthClient` model: immutable id, unique `clientId`, hashed secret, `enabled`, allowed scopes, timestamps.
- `POST /token` (`application/x-www-form-urlencoded`, `grant_type=client_credentials`).
- Short-lived JWT with `iss`, `sub`, `aud`, `iat`, `exp`, `scope` and `kid` in the header, asymmetric signing (RS256 or EdDSA) via jose; private key outside the repo.
- `GET /.well-known/jwks.json`: public keys only.
- Later: users, login and sessions for the dashboard.
