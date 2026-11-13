import {
  DELIVERY_TOPOLOGY,
  deliveryJobSchema,
} from "@relay-ops/backend-shared/queue"

import type { DeliveryJob } from "@relay-ops/backend-shared/queue"
import type { Channel } from "amqplib"

type CreateDeliveryPublisherParams = {
  channel: Channel
}

export type DeliveryPublisher = {
  publish: (jobs: DeliveryJob[]) => Promise<void>
}

/**
 * Creates a publisher for persistent delivery jobs on the shared queue topology.
 */
export function createDeliveryPublisher(
  params: CreateDeliveryPublisherParams,
): DeliveryPublisher {
  const { channel } = params

  const publish = async (jobs: DeliveryJob[]) => {
    for (const job of jobs) {
      const body = deliveryJobSchema.parse(job)

      channel.publish(
        DELIVERY_TOPOLOGY.exchange,
        DELIVERY_TOPOLOGY.routingKey,
        Buffer.from(JSON.stringify(body)),
        {
          persistent: true,
          contentType: "application/json",
          messageId: body.deliveryId,
          timestamp: Date.now(),
        },
      )
    }
  }

  return {
    publish,
  }
}
