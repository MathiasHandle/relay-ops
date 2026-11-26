import {
  assertDeliveryTopology,
  connectQueue,
} from "@relay-ops/backend-shared/queue"
import { env } from "@/config/env"

import type { FastifyInstance } from "fastify"

type ConnectServerQueueParams = {
  app: FastifyInstance
  onDisconnect?: () => void
}

/**
 * Connects to RabbitMQ, declares the topology the server publishes to and closes
 * the connection when the app closes. One connection per app, shared by all publishers.
 */
export async function connectServerQueue(params: ConnectServerQueueParams) {
  const { app, onDisconnect } = params

  const { connection, channel } = await connectQueue({
    url: env.RABBITMQ_URL,
    logger: app.log,
  })

  let closing = false
  let channelClosed = false
  let connectionClosed = false

  channel.on("close", () => {
    channelClosed = true
    if (!closing) onDisconnect?.()
  })

  connection.on("close", () => {
    connectionClosed = true
    if (!closing) onDisconnect?.()
  })

  app.addHook("onClose", async () => {
    closing = true

    try {
      if (!channelClosed && !connectionClosed) await channel.close()
    } finally {
      if (!connectionClosed) await connection.close()
    }
  })

  await assertDeliveryTopology({ channel })

  return channel
}
