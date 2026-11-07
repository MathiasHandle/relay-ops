# packages/configs

Shared tooling configs consumed by every app and package. Plain JS/JSON on purpose:
the tools load them directly without a build step, so there is no `build` or
`check:ts` here.

| Package                      | Path        | Exports                      |
| ---------------------------- | ----------- | ---------------------------- |
| `@relay-ops/prettier-config` | `prettier/` | `.` (`index.js`)             |
| `@relay-ops/tsconfig`        | `tsconfig/` | `./base.json`, `./node.json` |
| `@relay-ops/eslint-config`   | `eslint/`   | `./base`, `./node`           |

Dependency order (no cycles): `prettier-config` ← `tsconfig` ← `eslint-config` ←
apps and packages. `prettier-config` is a leaf and formats itself via a relative path;
`eslint-config` lints itself via `eslint.config.js` re-exporting `./node.js`.

## prettier

- Consumers reference it via `"prettier": "@relay-ops/prettier-config"` in `package.json`.

## tsconfig

- `base.json`: runtime-agnostic settings; `node.json`: extends base for Node.js.
- `node.json` uses `moduleResolution: "Bundler"` (builds are done by tsdown, `tsc` only type-checks).
- Consumers extend `@relay-ops/tsconfig/node.json` and set `noEmit`, `paths` and `include` themselves.

## eslint

- `base.js`: rules for all TypeScript code (runtime-agnostic); `node.js`: base + Node globals.
- Consumers use `defineConfig(node, ...)` and may disable the Prisma import
  restriction (`@typescript-eslint/no-restricted-imports`) only if they own a database.
- Rule messages and comments in English.

## Rules

- Changes here affect the whole monorepo: after editing run
  `pnpm turbo run check:lint check:format check:ts` from the root.
- Frontend configs (Next.js tsconfig/ESLint) are added only together with `apps/dashboard`.
- Keep peer ranges aligned with the installed majors (ESLint 10, TypeScript 6).
