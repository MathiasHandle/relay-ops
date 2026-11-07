# packages/app-db (`@relay-ops/app-db`)

Owns the application database: Prisma schema, migrations and client. Consumers:
`apps/server` and the future `apps/worker`. Never the frontend.

## Public API (`"."` export only, from `dist/`)

- Everything from the generated Prisma client (model types, `PrismaClient`, enums).
- `createPrismaClient(connectionString?)` and a `prisma` singleton created at import.
- `src/env.ts` validates `APP_DATABASE_URL` with Zod at import time.

## Layout

- `prisma/schema.prisma`: generator output `src/generated/prisma` (gitignored, ignored by ESLint and Prettier).
- `prisma/migrations/`: app migrations, run only against the app DB.
- `prisma.config.ts`: loads `.env`; outside the tsconfig include, hence `/// <reference types="node" />`.
- Build: `tsc` with `rootDir: "src"` and declarations; consumers need the build output.

## Rules

- Database: `postgres-app`, `localhost:5433/relay_ops_app`, env `APP_DATABASE_URL`.
- No relations to auth data; store auth identities only as plain ids (`ApiPrincipal`).
- After a schema change: `pnpm --filter @relay-ops/app-db db:migrate` (also regenerates the client), then rebuild.
- Do not add a browser/frontend export; shared API types belong in `packages/contracts`.
