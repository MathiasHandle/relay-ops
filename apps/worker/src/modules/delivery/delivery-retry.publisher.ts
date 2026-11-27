import { randomUUID } from "node:crypto"
import { DELIVERY_TOPOLOGY } from "@relay-ops/backend-shared/queue"

import type { ConfirmChannel } from "amqplib"

type CreateRetryPublisherParams = {
  channel: ConfirmChannel
}

export function createRetryPublisher(params: CreateRetryPublisherParams) {
  const { channel } = params
  const pending = new Map<string, { returned: boolean }>()

  channel.on("return", (message) => {
    const messageId = message.properties.messageId

    if (!messageId) return
    const entry = pending.get(messageId)
    if (entry) entry.returned = true
  })

  async function publish(params: PublishRetryParams): Promise<void> {
    const { content, routingKey } = params
    const messageId = randomUUID()
    const entry = { returned: false }
    pending.set(messageId, entry)

    let timeout: ReturnType<typeof setTimeout> | undefined

    try {
      await new Promise<void>((resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Retry publish confirm timed out"))
        }, 5000)

        channel.publish(
          DELIVERY_TOPOLOGY.retry.exchange,
          routingKey,
          content,
          {
            persistent: true,
            contentType: "application/json",
            mandatory: true,
            messageId,
          },
          (error) => {
            if (error) {
              reject(error)
            } else if (entry.returned) {
              reject(new Error("Retry message could not be routed"))
            } else {
              resolve()
            }
          },
        )
      })
    } finally {
      clearTimeout(timeout)
      pending.delete(messageId)
    }
  }

  return { publish }
}

type PublishRetryParams = {
  content: Buffer
  routingKey: string
}
