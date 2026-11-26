# relay-ops

Event relay platform: machine clients authenticate against a custom JWT issuer, submit events over a REST API, and a worker delivers them to external HTTP destinations.

> **Status:** Local Kubernetes MVP in progress. Auth, event ingestion and asynchronous delivery are implemented.

The server stores each Event, its Deliveries and outbox records in one database transaction. A separate outbox publisher sends delivery jobs to RabbitMQ; a worker then sends HTTP requests to destinations. The publisher waits for broker confirmation, but an uncertain result or a later database failure can cause a job to be published again.

Webhook receivers must handle duplicate deliveries. The worker sends the stable `X-RelayOps-Delivery-Id` header on each attempt for the same Delivery. A receiver can use it to deduplicate requests; retries and failures can result in more than one HTTP request.

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
│   ├── server/             # REST API and separate outbox publisher process; uses the app database via @relay-ops/app-db
│   └── worker/             # RabbitMQ consumer and HTTP delivery
├── packages/
│   ├── app-db/             # Prisma schema, migrations and client for the app database (relay_ops_app)
│   ├── backend-shared/     # shared queue topology and job schema
│   ├── contracts/          # shared API contracts
│   └── configs/
│       ├── eslint/         # @relay-ops/eslint-config
│       ├── prettier/       # @relay-ops/prettier-config
│       └── tsconfig/       # @relay-ops/tsconfig
├── infra/                  # Kubernetes manifests and local setup
├── compose.yaml            # local PostgreSQL instances and RabbitMQ
└── turbo.json
```

## Databases

Auth and the app use two separate PostgreSQL instances. They never share credentials or tables.

| Service         | Database         | Host port | Env variable        | Used by                                         |
| --------------- | ---------------- | --------- | ------------------- | ----------------------------------------------- |
| `postgres-auth` | `relay_ops_auth` | `5432`    | `AUTH_DATABASE_URL` | `apps/auth`                                     |
| `postgres-app`  | `relay_ops_app`  | `5433`    | `APP_DATABASE_URL`  | `apps/server`, `apps/worker`, `packages/app-db` |

## Prerequisites

- Node.js 24 (see `.nvmrc`; pnpm downloads the exact version from `devEngines` automatically)
- pnpm 12 (`corepack enable` picks the version from `packageManager`)
- Docker with Docker Compose
- OpenSSL for the Auth signing key

## Getting started

For the local Kubernetes setup, see [infra/README.md](infra/README.md).

To run the applications on the host with dependencies in Docker Compose:

```bash
# 1. Install dependencies and generate the Prisma clients
pnpm install
pnpm turbo run db:generate

# 2. Create local env files from the examples
cp apps/auth/.env.example apps/auth/.env
cp apps/server/.env.example apps/server/.env
cp apps/worker/.env.example apps/worker/.env
cp packages/app-db/.env.example packages/app-db/.env

# 3. Create the Auth signing key once
mkdir -p apps/auth/keys
test -f apps/auth/keys/jwt-private.pem || openssl genpkey -algorithm ED25519 -out apps/auth/keys/jwt-private.pem
chmod 600 apps/auth/keys/jwt-private.pem

# 4. Start PostgreSQL and RabbitMQ
docker compose up -d

# 5. Apply database migrations
pnpm --filter auth db:migrate
pnpm --filter @relay-ops/app-db db:migrate

# 6. Optional: seed local development data
pnpm --filter auth db:seed
pnpm --filter @relay-ops/app-db db:seed

# 7. Start all apps and the outbox publisher in watch mode
pnpm dev
```

The seed uses known development credentials and placeholder destination URLs.
To start only the outbox publisher, run `pnpm --filter server dev:publisher`.

Health checks:

```bash
curl http://localhost:3002/health   # auth
curl http://localhost:3001/health   # server
```

## Scripts

Run from the repository root; Turborepo executes them in every package that defines them.

| Script                | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `pnpm dev`            | Start all apps and the outbox publisher in watch mode |
| `pnpm build`          | Build all packages and apps                           |
| `pnpm build:packages` | Build only the packages in `packages/`                |
| `pnpm check:ts`       | Type-check                                            |
| `pnpm check:lint`     | Lint                                                  |
| `pnpm check:format`   | Check formatting                                      |
| `pnpm fix:lint`       | Lint and apply auto-fixes                             |
| `pnpm fix:format`     | Format files                                          |
| `pnpm test`           | Run tests                                             |

`check:*` scripts only report problems, `fix:*` scripts write changes.

Server integration tests run sequentially against a dedicated `_test` database. Their setup resets it once per run and clears application tables before each test; do not point them at a development or shared database.

Database scripts (run with `pnpm --filter <package> <script>` in `apps/auth` or `packages/app-db`):

| Script        | Description                                 |
| ------------- | ------------------------------------------- |
| `db:generate` | Generate the Prisma client                  |
| `db:migrate`  | Create and apply migrations (development)   |
| `db:deploy`   | Apply existing migrations (CI / production) |
| `db:studio`   | Open Prisma Studio                          |

## Conventions

- The app database is accessed only through `@relay-ops/app-db`; importing Prisma directly is blocked by ESLint. `apps/auth` is the exception, it owns its database.
- The frontend never imports `@relay-ops/app-db`; it talks to the server HTTP API using shared DTOs.
- Never commit `.env` files, credentials or private keys.
