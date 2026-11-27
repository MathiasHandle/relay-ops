import { setTimeout as delay } from "node:timers/promises"
import Fastify from "fastify"
import { prisma } from "@relay-ops/app-db"
import { env } from "@/config/env"
import {
  cleanupPublishedOutbox,
  createDeliveryPublisher,
  publishDeliveryBatch,
} from "@/modules/delivery"
import { connectServerQueue } from "@/shared/queue/queue-connection"

const app = Fastify({ logger: { level: env.LOG_LEVEL } })
const shutdown = new AbortController()

// graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "Stopping outbox publisher")
    shutdown.abort()
  })
}

try {
  // connect to RabbitMQ server + create topology
  const channel = await connectServerQueue({
    app,
    onDisconnect: () => {
      app.log.error("RabbitMQ connection or channel closed")
      process.exitCode = 1
      shutdown.abort()
    },
  })

  const deliveryPublisher = createDeliveryPublisher({ channel })

  let nextCleanupAt = 0
  while (!shutdown.signal.aborted) {
    // check if outbox table should be cleaned up
    if (Date.now() >= nextCleanupAt) {
      const hasMore = await cleanupPublishedOutbox({ db: prisma })
      if (!hasMore) nextCleanupAt = Date.now() + 60 * 60_000
    }

    if (shutdown.signal.aborted) break

    // publish delivery messages
    const result = await publishDeliveryBatch({
      db: prisma,
      deliveryPublisher,
      logger: app.log,
    })

    // nothing to publish now, wait for a little while in order not to query DB
    if (result === "empty") {
      await delay(10000, undefined, { signal: shutdown.signal }).catch(
        (err: unknown) => {
          if (!shutdown.signal.aborted) throw err
        },
      )
    }
  }
} catch (err) {
  app.log.error({ err }, "Outbox publisher stopped")
  process.exitCode = 1
} finally {
  try {
    await app.close()
  } finally {
    await prisma.$disconnect()
  }
}
