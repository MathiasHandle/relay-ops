import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"
import { createDeliveryPublisher } from "./delivery-publisher"
import { DeliveryPublishError } from "./delivery-publisher.errors"

import type { ConfirmChannel, Options } from "amqplib"

class FakeConfirmChannel extends EventEmitter {
  readonly published: {
    options: Options.Publish
    confirm: (error: Error | null) => void
  }[] = []

  publish(
    _exchange: string,
    _routingKey: string,
    _content: Buffer,
    options: Options.Publish,
    confirm: (error: Error | null) => void,
  ) {
    this.published.push({ options, confirm })
    return true
  }
}

function setup() {
  const channel = new FakeConfirmChannel()
  // The publisher uses only the event and confirm-publish parts of amqplib's channel.
  const publisher = createDeliveryPublisher({
    channel: channel as unknown as ConfirmChannel,
  })
  return { channel, publisher }
}

function publishedAt(channel: FakeConfirmChannel, index: number) {
  const published = channel.published[index]
  if (!published) throw new Error("Expected a published message")
  return published
}

const jobs = [
  { deliveryId: "tz4a98xxat96iws9zmbrgj3a" },
  { deliveryId: "az4a98xxat96iws9zmbrgj3a" },
  { deliveryId: "bz4a98xxat96iws9zmbrgj3a" },
]

describe("delivery publisher", () => {
  it("reports confirmed, current and unattempted jobs when a batch fails", async () => {
    const { channel, publisher } = setup()
    const result = publisher.publish(jobs)
    const failure = expect(result).rejects.toMatchObject({
      deliveryId: jobs[1]?.deliveryId,
      confirmedDeliveryIds: [jobs[0]?.deliveryId],
      unattemptedDeliveryIds: [jobs[2]?.deliveryId],
      cause: expect.objectContaining({ message: "channel closed" }),
    })
    publishedAt(channel, 0).confirm(null)
    await vi.waitFor(() => expect(channel.published).toHaveLength(2))
    publishedAt(channel, 1).confirm(new Error("channel closed"))
    await failure
    expect(channel.published).toHaveLength(2)
  })

  it("rejects a returned mandatory message even if it is confirmed", async () => {
    const { channel, publisher } = setup()
    const result = publisher.publish([jobs[0]])
    const failure = expect(result).rejects.toBeInstanceOf(DeliveryPublishError)
    const published = publishedAt(channel, 0)
    expect(published.options.mandatory).toBe(true)
    channel.emit("return", {
      properties: { messageId: published.options.messageId },
    })
    published.confirm(null)
    await failure
  })
})
