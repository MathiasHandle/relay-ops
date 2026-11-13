import { DELIVERY_TOPOLOGY } from "@relay-ops/backend-shared/queue"

import type { Channel } from "amqplib"
import type { FastifyBaseLogger } from "fastify"

type StartDeliveryConsumerParams = {
  channel: Channel
  logger: FastifyBaseLogger
}

export async function startDeliveryConsumer(
  params: StartDeliveryConsumerParams,
) {
  const { channel, logger } = params

  const { consumerTag } = await channel.consume(
    DELIVERY_TOPOLOGY.queue,
    (message) => {
      // null = the broker cancelled the consumer (e.g. the queue was deleted)
      if (!message) return

      logger.debug("delivery job received")
      channel.ack(message)
    },
  )

  logger.info("delivery consumer started")

  return {
    consumerTag,
  }
}
