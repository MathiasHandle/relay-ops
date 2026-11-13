import {
  assertDeliveryTopology,
  connectQueue,
} from "@relay-ops/backend-shared/queue"
import { env } from "@/config/env"

import type { FastifyInstance } from "fastify"

type ConnectServerQueueParams = {
  app: FastifyInstance
}

/**
 * Connects to RabbitMQ, declares the topology the server publishes to and closes
 * the connection when the app closes. One connection per app, shared by all publishers.
 */
export async function connectServerQueue(params: ConnectServerQueueParams) {
  const { app } = params

  const { connection, channel } = await connectQueue({
    url: env.RABBITMQ_URL,
    logger: app.log,
  })
  await assertDeliveryTopology({ channel })

  app.addHook("onClose", async () => {
    await channel.close()
    await connection.close()
  })

  return channel
}
