# relay-ops

Multi-tenant event relay platform. Machine clients obtain a JWT from our own issuer,
submit events to a REST API, events are persisted and delivered asynchronously
(RabbitMQ → worker) to external HTTP destinations. Target: at-least-once delivery with
idempotency, retries, DLQ and a transactional outbox; strict tenant isolation by
`Organization`.

Current state: bootstrap only. Apps expose `GET /health`, Prisma schemas have no models.

## Architecture

| Path                 | Role                                                                                    | Details                     |
| -------------------- | --------------------------------------------------------------------------------------- | --------------------------- |
| `apps/auth`          | Standalone JWT issuer (client credentials). Own DB `relay_ops_auth`. Port 3002.         | `apps/auth/AGENTS.md`       |
| `apps/server`        | Public REST API (Fastify). Verifies JWTs via JWKS. Uses app DB. Port 3001.              | `apps/server/AGENTS.md`     |
| `packages/app-db`    | Prisma schema, migrations and client for app DB `relay_ops_app`.                        | `packages/app-db/AGENTS.md` |
| `packages/configs/*` | Shared ESLint, Prettier and tsconfig (`@relay-ops/*-config`, `@relay-ops/tsconfig`).    |                             |

Planned, create only when needed: `apps/worker` (RabbitMQ consumer, HTTP delivery,
uses app-db), `apps/dashboard` (Next.js, talks only to the server HTTP API),
`packages/contracts` (Zod DTOs shared by server and dashboard), `apps/mcp`, `infra/`
(Kubernetes).

### Data boundaries (do not break)

- Two separate PostgreSQL instances: `postgres-auth` (localhost:5432) and
  `postgres-app` (localhost:5433), see `compose.yaml`. Production: two Neon projects.
- Env vars: `AUTH_DATABASE_URL` (auth only), `APP_DATABASE_URL` (server, worker, app-db).
- Auth never reads app tables; server/worker never read auth tables. No cross-DB
  foreign keys. Identity links via JWT `sub` / `client_id` → `ApiPrincipal` in app DB.
- The server verifies tokens via JWKS only (no auth DB access, no shared secret).
- Frontend never imports `@relay-ops/app-db`; Prisma models are not API contracts, use DTOs.

## Tooling

- pnpm 10 workspaces + Turborepo, Node 24, ESM everywhere.
- TypeScript 6 (NodeNext, `verbatimModuleSyntax`): relative imports need `.js` extensions.
- ESLint 10 flat config, Prettier (no semicolons, double quotes, trailing commas).
- Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`), Fastify 5, Zod 4, jose.
- Local dev is hybrid: `docker compose up -d` runs only the databases, apps run on
  the host via `pnpm dev`.
- Run tasks via Turbo from the root. Prisma client generation is the turbo task
  `db:generate`; `build`, `check:ts` and `check:format` depend on it, the package
  scripts themselves do not generate.
- Script naming: `check:*` only reports, `fix:*` writes.
- Verify changes with: `pnpm turbo run check:ts check:lint check:format build`.

## Code conventions (enforced by ESLint)

- No enums (use unions or `as const`), no `any`, no non-null assertions.
- Type imports in a separate `import type { ... }` statement; imports auto-sorted.
- Prisma may be imported only via `@relay-ops/app-db` (exceptions: `apps/auth`, `packages/app-db`).
- `as` type assertions are a last resort. Do not cast objects or return values when
  Zod parsing, a proper type, a type guard or another cleaner solution works; use
  `as` only when nothing else fits the context. `as const` is fine (e.g. enum-like
  objects). Not enforced by ESLint.
- Validate env with Zod in `src/env.ts`.
- Code comments, log and error messages, docs: English.

## Dependencies

- Stable releases only, never rc/alpha/beta/canary. Check `npm view <pkg> dist-tags`:
  Prisma's `latest` tag points to an 8.0 RC, so pin Prisma packages to `^7`.
- Keep TypeScript on 6.x (typescript-eslint supports <6.1; TS 7 lacks tooling support).
- Packages with `postinstall: prisma generate` (auth, app-db): if postinstall fails,
  pnpm silently reverts `package.json` after `pnpm add`. Always verify `package.json`.

## Working rules

- Implement only what was asked. No unrequested features, logic or refactors; propose them instead.
- Plans: present the plan for approval first, implement only after explicit approval.
- AGENTS.md / CLAUDE.md: before editing any of them, show the proposed change and wait for the user's decision.
- Commits: always ask before committing. Messages short, English, imperative.
- Never commit `.env` files, credentials or private keys.
- When working inside an app or package, follow its own `AGENTS.md`.
