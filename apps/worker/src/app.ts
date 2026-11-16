import Fastify from "fastify"
import { prisma } from "@relay-ops/app-db"
import {
  assertDeliveryTopology,
  connectQueue,
} from "@relay-ops/backend-shared/queue"
import { env } from "@/config/env"
import { startDeliveryConsumer } from "./modules/delivery/delivery.consumer"
import { createRetryPublisher } from "./modules/delivery/delivery-retry.publisher"

type BuildAppOptions = {
  logger: boolean
}

export const buildApp = async (options: BuildAppOptions) => {
  const { logger } = options

  const app = Fastify({ logger })

  const { connection, channel } = await connectQueue({
    url: env.RABBITMQ_URL,
    logger: app.log,
  })

  const { channel: deliveryChannel } = await assertDeliveryTopology({ channel })
  const retryPublisher = createRetryPublisher({ channel })

  // at most one unacknowledged message at a time per consumer
  await channel.prefetch(1)

  const { consumerTag } = await startDeliveryConsumer({
    channel: deliveryChannel,
    logger: app.log,
    retryPublisher,
  })

  app.addHook("onClose", async () => {
    await channel.cancel(consumerTag) // stop receiving messages
    await channel.close()
    await connection.close()

    await prisma.$disconnect()
  })

  app.get("/health", async () => ({ status: "ok" }))

  return app
}
