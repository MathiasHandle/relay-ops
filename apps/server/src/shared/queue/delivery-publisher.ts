import { randomUUID } from "node:crypto"
import {
  DELIVERY_TOPOLOGY,
  deliveryJobSchema,
} from "@relay-ops/backend-shared/queue"
import { DeliveryPublishError } from "./delivery-publisher.errors"

import type { DeliveryJob } from "@relay-ops/backend-shared/queue"
import type { ConfirmChannel } from "amqplib"

type CreateDeliveryPublisherParams = {
  channel: ConfirmChannel
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

  // track mandatory returns until their publish confirms arrive
  const pendingMessages = new Map<string, { returned: boolean }>()

  channel.on("return", (message) => {
    const messageId = message.properties.messageId
    if (!messageId) return

    const entry = pendingMessages.get(messageId)
    if (entry) entry.returned = true
  })

  return {
    publish: (jobs) => publishJobs({ jobs, pendingMessages, channel }),
  }
}

type PublishJobsParams = {
  jobs: DeliveryJob[]
  pendingMessages: Map<string, { returned: boolean }>
  channel: ConfirmChannel
}

async function publishJobs(params: PublishJobsParams): Promise<void> {
  const { jobs, pendingMessages, channel } = params
  const confirmedDeliveryIds: string[] = []

  // publishes jobs sequentially
  for (const [index, job] of jobs.entries()) {
    const body = deliveryJobSchema.parse(job)

    try {
      await publishJob({ channel, pendingMessages, job: body })
      confirmedDeliveryIds.push(body.deliveryId)
    } catch (cause) {
      throw new DeliveryPublishError({
        deliveryId: body.deliveryId,
        confirmedDeliveryIds,
        unattemptedDeliveryIds: jobs
          .slice(index + 1)
          .map((remainingJob) => remainingJob.deliveryId),
        cause,
      })
    }
  }
}

type PublishJobParams = {
  channel: ConfirmChannel
  pendingMessages: Map<string, { returned: boolean }>
  job: DeliveryJob
}

async function publishJob(params: PublishJobParams): Promise<void> {
  const { channel, pendingMessages, job } = params
  const messageId = randomUUID()
  const entry = { returned: false }
  // match a possible return event to this publish attempt
  pendingMessages.set(messageId, entry)

  try {
    await new Promise<void>((resolve, reject) => {
      channel.publish(
        DELIVERY_TOPOLOGY.exchange,
        DELIVERY_TOPOLOGY.routingKey,
        Buffer.from(JSON.stringify(job)),
        {
          persistent: true,
          contentType: "application/json",
          messageId,
          timestamp: Date.now(),
          mandatory: true,
        },
        (error) => {
          if (error) {
            // reject when the broker fails to confirm the publish
            reject(error)
            return
          }

          // message was published but couldn't be routed to queue
          if (entry.returned) {
            reject(new Error("Delivery job could not be routed"))
            return
          }

          // broker confirmed a message that was routed successfully
          resolve()
        },
      )
    })
  } finally {
    // remove tracking state after success or failure
    pendingMessages.delete(messageId)
  }
}
