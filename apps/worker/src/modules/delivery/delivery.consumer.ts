import {
  DELIVERY_TOPOLOGY,
  deliveryJobSchema,
} from "@relay-ops/backend-shared/queue"
import { parseMessage } from "@/shared/queue/parse-message"
import { processDelivery } from "./delivery.service"

import type { Channel } from "amqplib"
import type { FastifyBaseLogger } from "fastify"
import type { createRetryPublisher } from "./delivery-retry.publisher"

type StartDeliveryConsumerParams = {
  channel: Pick<Channel, "consume" | "ack" | "nack" | "reject">
  logger: FastifyBaseLogger
  retryPublisher: ReturnType<typeof createRetryPublisher>
}

export async function startDeliveryConsumer(
  params: StartDeliveryConsumerParams,
) {
  const { channel, logger: deliveryLogger, retryPublisher } = params

  const { consumerTag } = await channel.consume(
    DELIVERY_TOPOLOGY.process.queue,
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
          case "already-delivered":
            channel.ack(message)
            return

          case "not-found":
          case "destination-disabled":
          case "permanent-failure":
          case "max-attempts-reached":
          case "already-failed":
            logger.warn({ outcome: result.kind }, "Delivery job rejected")
            channel.reject(message, false)
            return

          case "retryable-failure": {
            const retryQueue =
              DELIVERY_TOPOLOGY.retry.queues[result.failedAttemptsCount - 1]
            if (!retryQueue) throw new Error("Retry queue not configured")

            await retryPublisher.publish({
              content: message.content,
              routingKey: retryQueue.routingKey,
            })
            channel.ack(message)
            return
          }
        }
      } catch (error) {
        logger.error(
          { err: error },
          "Delivery processing failed; job will be requeued",
        )
        channel.nack(message, false, true)
      }
    },
    { noAck: false },
  )

  return { consumerTag }
}
