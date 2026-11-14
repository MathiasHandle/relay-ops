import {
  DELIVERY_TOPOLOGY,
  deliveryJobSchema,
} from "@relay-ops/backend-shared/queue"
import { parseMessage } from "@/shared/queue/parse-message"
import { processDelivery } from "./delivery.service"

import type { Channel } from "amqplib"
import type { FastifyBaseLogger } from "fastify"

type StartDeliveryConsumerParams = {
  channel: Pick<Channel, "consume" | "ack" | "nack" | "reject">
  logger: FastifyBaseLogger
}

export async function startDeliveryConsumer(
  params: StartDeliveryConsumerParams,
) {
  const { channel, logger: deliveryLogger } = params

  const { consumerTag } = await channel.consume(
    DELIVERY_TOPOLOGY.queue,
    async (message) => {
      deliveryLogger.debug("delivery job received")
      // null = the broker cancelled the consumer (e.g. the queue was deleted)
      if (!message) return

      const parsed = parseMessage({
        content: message.content,
        schema: deliveryJobSchema,
      })
      if (!parsed.success) {
        deliveryLogger.error(
          { err: parsed.error },
          "Failed parsing message or missing data",
        )
        channel.reject(message, false)
        return
      }

      const { deliveryId } = parsed.data
      const logger = deliveryLogger.child({ deliveryId })

      try {
        const result = await processDelivery({ deliveryId, logger })

        switch (result.kind) {
          case "delivered":
          case "already-finished":
            channel.ack(message)
            return

          case "not-found":
          case "destination-disabled":
            logger.warn({ outcome: result.kind }, "Delivery job rejected")
            channel.reject(message, false)
            return

          case "attempt-failed":
            // TODO retries + backoff + DLQ
            channel.nack(message, false, true)
            return
        }
      } catch {
        logger.error("Delivery processing failed; job will be requeued")
        channel.nack(message, false, true)
      }
    },
  )

  return { consumerTag }
}
