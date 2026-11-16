# apps/worker

Standalone process that consumes delivery jobs from RabbitMQ and delivers events to
external HTTP destinations. Uses the app DB via `@relay-ops/app-db`. Port 3003.

## Layout

- `src/main.ts`: composition root, `buildApp({ logger: true })` + `listen`, SIGINT/SIGTERM → `app.close()`.
- `src/app.ts`: `buildApp({ logger })`: Fastify, `GET /health`, RabbitMQ connection +
  delivery topology, starts the delivery consumer; `onClose` cancels the consumer, closes
  the channel and connection, then disconnects Prisma. Shutdown does not wait for an
  in-flight delivery to finish.
- `src/modules/delivery/delivery.consumer.ts`: validates jobs, calls `processDelivery`
  and acknowledges, rejects or requeues messages based on the result.
- `src/modules/delivery/delivery.service.ts`: loads a delivery, creates attempts,
  sends the HTTP request and persists the result.
- `src/modules/delivery/delivery.repository.ts`: database operations for delivery processing.
- `src/shared/http/`: HTTP request helper with timeout and redirects disabled.
- `src/test/`: integration setup and data factories. Integration tests use the
  dedicated `relay_ops_worker_test` database and a controlled HTTP destination.
- `src/config/env.ts`: Zod env schema (`PORT` default 3003, `RABBITMQ_URL` incl. vhost).
  `APP_DATABASE_URL` is validated by `@relay-ops/app-db`.

## Rules

- The worker serves no public API; HTTP is only for health checks.
- Database access only via `@relay-ops/app-db`. Never access the auth database.
- Cleanup of long-lived resources (consumer, AMQP connection, Prisma) goes into `onClose` hooks.
- Log per message via `app.log.child({ deliveryId, ... })`, passed down as a parameter.
- Retryable HTTP failures (408, 429, 5xx, timeout, or network failure) use 10, 20, and 40 second delays;
  permanent HTTP failures go directly to the dead-letter queue.
- Four completed failed attempts are allowed per delivery. The final failure marks the delivery as
  `FAILED` and routes the job to the dead-letter queue; each retry records another attempt.
- The consumer uses `prefetch(1)`. If retry publishing fails, the original job is requeued immediately.
