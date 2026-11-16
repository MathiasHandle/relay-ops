# relay-ops

Multi-tenant event relay platform. Machine clients obtain a JWT from our own issuer,
submit events to a REST API, events are persisted and delivered asynchronously
(RabbitMQ → worker) to external HTTP destinations. Target: at-least-once delivery with
idempotency, retries, DLQ and a transactional outbox; strict tenant isolation by
`Organization`.

Current state: `apps/auth` issues JWTs (client credentials) and serves JWKS;
`apps/server` verifies JWTs, checks scopes, stores events and publishes delivery jobs
to RabbitMQ; `apps/worker` consumes them.
App schema: see `packages/app-db`.

## Architecture

| Path                      | Role                                                                                   | Details                             |
| ------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `apps/auth`               | Standalone JWT issuer (client credentials). Own DB `relay_ops_auth`. Port 3002.        | `apps/auth/AGENTS.md`               |
| `apps/server`             | Public REST API (Fastify). Verifies JWTs via JWKS. Uses app DB. Port 3001.             | `apps/server/AGENTS.md`             |
| `apps/worker`             | RabbitMQ consumer, HTTP delivery to destinations. Uses app DB. Port 3003.              | `apps/worker/AGENTS.md`             |
| `packages/app-db`         | Prisma schema, migrations and client for app DB `relay_ops_app`.                       | `packages/app-db/AGENTS.md`         |
| `packages/contracts`      | Shared contracts (OAuth scopes, API enums, later DTOs). No runtime deps, browser-safe. |                                     |
| `packages/backend-shared` | Code shared by Node apps (server, worker): queue topology and job schema. Node only.   | `packages/backend-shared/AGENTS.md` |
| `packages/configs/*`      | Shared ESLint, Prettier and tsconfig (`@relay-ops/*-config`, `@relay-ops/tsconfig`).   |                                     |

Planned, create only when needed: `apps/dashboard` (Next.js, talks only to the server
HTTP API), `apps/mcp`, `infra/` (Kubernetes).

### Data boundaries (do not break)

- Two separate PostgreSQL instances: `postgres-auth` (localhost:5432) and
  `postgres-app` (localhost:5433), see `compose.yaml`. Production: two Neon projects.
- Env vars: `AUTH_DATABASE_URL` (auth only), `APP_DATABASE_URL` (server, worker, app-db).
- Auth never reads app tables; server/worker never read auth tables. No cross-DB
  foreign keys. Identity links via JWT `iss` + `sub` (= `OAuthClient.id`) →
  `OAuthIdentity` (`issuer`, `subject`) → `Organization` in app DB. `client_id` and
  `name` are never used as keys.
- The server verifies tokens via JWKS only (no auth DB access, no shared secret).
- Frontend never imports `@relay-ops/app-db`; Prisma models are not API contracts, use DTOs.

## Tooling

- pnpm 12 workspaces + Turborepo, Node 24, ESM everywhere.
- TypeScript 6 (`moduleResolution: "Bundler"`, `verbatimModuleSyntax`): `tsc` only
  type-checks (`noEmit`). Apps and `packages/app-db` are built with tsdown into `dist/`.
- Imports without file extensions. Alias `@/` → `src/` (tsconfig `paths`, per app;
  not in `packages/app-db`). Use relative imports inside the same module/folder and
  `@/` for anything outside it (`@/shared/db/prisma`, `@/modules/oauth`).
  `packages/configs/*` are loaded by Node directly and keep `.js` extensions.
- ESLint 10 flat config, Prettier (no semicolons, double quotes, trailing commas).
- Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`), Fastify 5, Zod 4, jose.
- Local dev is hybrid: `docker compose up -d` runs the databases and RabbitMQ (management
  UI at http://localhost:15672, vhost `relay-ops`), apps run on the host via `pnpm dev`.
- Run tasks via Turbo from the root. Prisma client generation is the turbo task
  `db:generate`; `build`, `check:ts` and `check:format` depend on it, the package
  scripts themselves do not generate.
- Script naming: `check:*` only reports, `fix:*` writes.
- Verify changes with: `pnpm turbo run check:ts check:lint check:format build test:unit`.
  Integration tests need the local databases (`docker compose up -d`): `test:integration`.

## Code conventions (enforced by ESLint)

- No enums (use unions or `as const`), no `any`, no non-null assertions.
- Type imports in a separate `import type { ... }` statement; imports auto-sorted.
- Prisma may be imported only via `@relay-ops/app-db` (exceptions: `apps/auth`, `packages/app-db`).
- `as` type assertions are a last resort. Do not cast objects or return values when
  Zod parsing, a proper type, a type guard or another cleaner solution works; use
  `as` only when nothing else fits the context. `as const` is fine (e.g. enum-like
  objects). Not enforced by ESLint.
- Own functions with several parameters take one typed options object; destructure it
  in the body (`const { a, b } = options`), not in the signature. Framework callbacks
  (Fastify handlers, hooks, error handlers) keep their positional signature. Not
  enforced by ESLint.
- Validate env with Zod in `src/config/env.ts`.
- File names: kebab-case with a role suffix (`oauth.routes.ts`, `token.service.ts`,
  `oauth.error-handler.ts`); enforced by `unicorn/filename-case`.
- Database naming (both DBs): `snake_case` tables and columns. Prisma models stay
  PascalCase with camelCase fields, mapped via `@@map("table_name")` and
  `@map("column_name")` in `schema.prisma`.
- Code comments, log and error messages, docs: English.

## Testing

- Vitest, tests colocated with the code: `*.test.ts` unit (no DB, no HTTP),
  `*.int.test.ts` integration (`buildApp({ logger: false })` + `app.inject()` + real test DB).
- Scripts per app: `test`, `test:unit`, `test:integration`, `test:watch`.
- Integration tests use a dedicated database whose name ends with `_test`; a global setup
  refuses any other name, resets it once per run (`prisma migrate reset`) and creates it if
  missing. Never run tests against a dev or shared database.
- Tests create their own data (random ids via helpers in `src/test/`), never rely on the
  seed and never assume empty tables.
- Assert responses with the production Zod schemas instead of casting.
- Prisma blocks `migrate reset` when run by an AI agent: ask the user for explicit consent
  before running integration tests, or let them run the tests.

## Backend architecture (Fastify apps)

Modular monolith, modules by feature:

- `src/main.ts`: composition root (`buildApp()` + `listen`). `src/app.ts`: `buildApp()`
  creates and configures Fastify without listening (tests use `app.inject()`).
- `src/config/`: env. `src/shared/`: cross-module code (db client, global error handlers).
- `src/modules/<name>/`: one Fastify plugin per module; `index.ts` is its only public
  entry (registers routes, module-wide error handler and hooks). The URL prefix is set
  where the module is registered in `app.ts`.
- Inside a module: `*.routes.ts` (HTTP only: schema, call service, response),
  `*.schemas.ts` (Zod), `*.errors.ts`, `*.service.ts` (logic, no Fastify
  `request`/`reply`; throws typed domain errors). Many endpoints: one file per route
  in `routes/`.
- Modules own their tables: only the owning module writes them; reads across modules
  are allowed. Other modules call its exported functions, never its internal files.
  No circular module dependencies. For shared transactions pass the Prisma `tx` client.
- Errors: global error and 404 handler in `shared/errors`; a module with its own error
  contract sets it via `setErrorHandler` in its `index.ts` (encapsulated).
- Start with fewer, larger modules; split when a module grows or gets another consumer.

## Dependencies

- Stable releases only, never rc/alpha/beta/canary. Check `npm view <pkg> dist-tags`:
  Prisma's `latest` tag points to an 8.0 RC, so pin Prisma packages to `^7`.
- Keep TypeScript on 6.x (typescript-eslint supports <6.1; TS 7 lacks tooling support).
- Packages with `postinstall: prisma generate` (auth, app-db): if postinstall fails,
  pnpm silently reverts `package.json` after `pnpm add`. Always verify `package.json`.

## Working rules

- Mentoring and review rules: follow "Pokyny pre mentora a code review" in `roadmap.md`.
- Implement only what was asked. No unrequested features, logic or refactors; propose them instead.
- Plans: present the plan for approval first, implement only after explicit approval.
- AGENTS.md / CLAUDE.md: before editing any of them, show the proposed change and wait for the user's decision.
- Commits: always ask before committing. Messages short, English, imperative.
- Never commit `.env` files, credentials or private keys.
- When working inside an app or package, follow its own `AGENTS.md`.
