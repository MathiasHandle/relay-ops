# apps/worker

Standalone process that consumes delivery jobs from RabbitMQ and delivers events to
external HTTP destinations. Uses the app DB via `@relay-ops/app-db`. Port 3003.

## Layout

- `src/main.ts`: composition root, `buildApp({ logger: true })` + `listen`, SIGINT/SIGTERM → `app.close()`.
- `src/app.ts`: `buildApp({ logger })`: Fastify, `GET /health`, RabbitMQ connection +
  delivery topology, starts the delivery consumer; `onClose` cancels the consumer, closes
  channel and connection, then disconnects Prisma.
- `src/modules/delivery/delivery.consumer.ts`: `startDeliveryConsumer({ channel })` consumes
  the delivery queue and acks each message.
- `src/config/env.ts`: Zod env schema (`PORT` default 3003, `RABBITMQ_URL` incl. vhost).
  `APP_DATABASE_URL` is validated by `@relay-ops/app-db`.

## Rules

- The worker serves no public API; HTTP is only for health checks.
- Database access only via `@relay-ops/app-db`. Never access the auth database.
- Cleanup of long-lived resources (consumer, AMQP connection, Prisma) goes into `onClose` hooks.
- Log per message via `app.log.child({ deliveryId, ... })`, passed down as a parameter.
