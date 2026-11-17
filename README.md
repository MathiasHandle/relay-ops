# relay-ops

Event relay platform: machine clients authenticate against a custom JWT issuer, submit events over a REST API, and a worker delivers them to external HTTP destinations.

> **Status:** Phase 0 (bootstrap). The apps only expose `GET /health`; auth, event ingestion and delivery are not implemented yet.

## Tech stack

- [pnpm](https://pnpm.io) workspaces + [Turborepo](https://turborepo.com)
- TypeScript, [Fastify](https://fastify.dev), [Zod](https://zod.dev)
- [Prisma](https://www.prisma.io) with PostgreSQL 18 (Docker Compose for local development)
- ESLint + Prettier with shared configs

## Repository structure

```text
relay-ops/
├── apps/
│   ├── auth/               # JWT issuer, owns its own database (relay_ops_auth)
│   │   └── prisma/         # auth schema + migrations
│   └── server/             # REST API, uses the app database via @relay-ops/app-db
├── packages/
│   ├── app-db/             # Prisma schema, migrations and client for the app database (relay_ops_app)
│   └── configs/
│       ├── eslint/         # @relay-ops/eslint-config
│       ├── prettier/       # @relay-ops/prettier-config
│       └── tsconfig/       # @relay-ops/tsconfig
├── compose.yaml            # local PostgreSQL instances
└── turbo.json
```

## Databases

Auth and the app use two separate PostgreSQL instances. They never share credentials or tables.

| Service         | Database         | Host port | Env variable        | Used by                          |
| --------------- | ---------------- | --------- | ------------------- | -------------------------------- |
| `postgres-auth` | `relay_ops_auth` | `5432`    | `AUTH_DATABASE_URL` | `apps/auth`                      |
| `postgres-app`  | `relay_ops_app`  | `5433`    | `APP_DATABASE_URL`  | `apps/server`, `packages/app-db` |

## Prerequisites

- Node.js 24 (see `.nvmrc`; pnpm downloads the exact version from `devEngines` automatically)
- pnpm 10 (`corepack enable` picks the version from `packageManager`)
- Docker with Docker Compose

## Getting started

```bash
# 1. Install dependencies and generate the Prisma clients
pnpm install
pnpm turbo run db:generate

# 2. Create local env files from the examples
cp apps/auth/.env.example apps/auth/.env
cp apps/server/.env.example apps/server/.env
cp packages/app-db/.env.example packages/app-db/.env

# 3. Start both PostgreSQL instances
docker compose up -d

# 4. Apply database migrations
pnpm --filter auth db:migrate
pnpm --filter @relay-ops/app-db db:migrate

# 5. Start all apps in watch mode
pnpm dev
```

Health checks:

```bash
curl http://localhost:3002/health   # auth
curl http://localhost:3001/health   # server
```

## Scripts

Run from the repository root; Turborepo executes them in every package that defines them.

| Script                  | Description                                  |
| ----------------------- | -------------------------------------------- |
| `pnpm dev`              | Start all apps in watch mode                 |
| `pnpm build`            | Build all packages and apps                  |
| `pnpm build:packages`   | Build only the packages in `packages/`       |
| `pnpm check:ts`         | Type-check                                   |
| `pnpm check:lint`       | Lint                                         |
| `pnpm check:format`     | Check formatting                             |
| `pnpm fix:lint`         | Lint and apply auto-fixes                    |
| `pnpm fix:format`       | Format files                                 |
| `pnpm test`             | Run tests                                    |

`check:*` scripts only report problems, `fix:*` scripts write changes.

Database scripts (run with `pnpm --filter <package> <script>` in `apps/auth` or `packages/app-db`):

| Script        | Description                                   |
| ------------- | --------------------------------------------- |
| `db:generate` | Generate the Prisma client                    |
| `db:migrate`  | Create and apply migrations (development)     |
| `db:deploy`   | Apply existing migrations (CI / production)   |
| `db:studio`   | Open Prisma Studio                            |

## Conventions

- The app database is accessed only through `@relay-ops/app-db`; importing Prisma directly is blocked by ESLint. `apps/auth` is the exception, it owns its database.
- The frontend never imports `@relay-ops/app-db`; it talks to the server HTTP API using shared DTOs.
- Never commit `.env` files, credentials or private keys.
