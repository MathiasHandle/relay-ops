# packages/backend-shared (`@relay-ops/backend-shared`)

Code shared by the Node.js apps (`apps/server`, `apps/worker`). Never imported by the
frontend.

## Public API (subpath exports only, from `dist/`)

- `./queue` (deps: `amqplib`, `zod`):
  - `connectQueue({ url, logger })`: AMQP connection with an error listener + one channel.
  - `DELIVERY_TOPOLOGY` and `assertDeliveryTopology({ channel })`: delivery exchange,
    queue and binding; called by both producer (server) and consumer (worker).
  - `deliveryJobSchema`, `DeliveryJob`: job message `{ deliveryId }`.

## Rules

- Only code used by at least two Node apps. No database access (that is `@relay-ops/app-db`),
  no Fastify request/reply.
- Every directory under `src/` is a separate subpath export with its own tsdown entry;
  there is no root `"."` export, so importing one part never runs another's import-time code.
- New subpath: add `src/<name>/index.ts`, a tsdown entry `"<name>/index"` and an
  `exports["./<name>"]` entry in `package.json`.
- Relative imports only (no `@/` alias), so the emitted `.d.ts` stays resolvable.
- Queue names are versioned (`deliveries.process.v1`): queue arguments cannot change on
  an existing queue, so a change means a new queue version.
