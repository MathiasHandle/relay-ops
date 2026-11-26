import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDeliveryPublisher } from "./delivery-publisher"
import { DeliveryBatchInterruptedError } from "./delivery-publisher.errors"

import type { ConfirmChannel, Options } from "amqplib"

class FakeChannel extends EventEmitter {
  readonly messages: {
    options: Options.Publish
    confirm: (error: Error | null) => void
  }[] = []
  hasRoom = true

  publish(
    _exchange: string,
    _routingKey: string,
    _content: Buffer,
    options: Options.Publish,
    confirm: (error: Error | null) => void,
  ) {
    this.messages.push({ options, confirm })
    return this.hasRoom
  }
}

function setup() {
  const channel = new FakeChannel()
  const publisher = createDeliveryPublisher({
    channel: channel as unknown as ConfirmChannel,
  })
  return { channel, publisher }
}

const jobs = [
  { deliveryId: "tz4a98xxat96iws9zmbrgj3a" },
  { deliveryId: "az4a98xxat96iws9zmbrgj3a" },
  { deliveryId: "bz4a98xxat96iws9zmbrgj3a" },
]

afterEach(() => vi.useRealTimers())

describe("delivery outbox publisher", () => {
  it("collects out-of-order confirms and an unroutable message separately", async () => {
    const { channel, publisher } = setup()
    const result = publisher.publish(jobs)
    const [first, second, third] = channel.messages
    if (!first || !second || !third) throw new Error("Expected three messages")
    channel.emit("return", {
      properties: { messageId: second.options.messageId },
    })
    third.confirm(null)
    second.confirm(null)
    first.confirm(null)
    await expect(result).resolves.toEqual([
      { deliveryId: jobs[0]?.deliveryId, kind: "published" },
      { deliveryId: jobs[1]?.deliveryId, kind: "failed", code: "UNROUTABLE" },
      { deliveryId: jobs[2]?.deliveryId, kind: "published" },
    ])
  })

  it("records invalid jobs and failed confirms without stopping other jobs", async () => {
    const { channel, publisher } = setup()
    const result = publisher.publish([{ deliveryId: "" }, jobs[0]])
    const message = channel.messages[0]
    if (!message) throw new Error("Expected a published message")
    message.confirm(new Error("confirm failed"))
    await expect(result).resolves.toEqual([
      { deliveryId: "", kind: "failed", code: "INVALID_JOB" },
      {
        deliveryId: jobs[0]?.deliveryId,
        kind: "failed",
        code: "PUBLISH_FAILED",
      },
    ])
  })

  it("rejects the whole batch when the channel closes after a confirm", async () => {
    const { channel, publisher } = setup()
    const result = publisher.publish(jobs)
    const failure = expect(result).rejects.toBeInstanceOf(
      DeliveryBatchInterruptedError,
    )
    const first = channel.messages[0]
    if (!first) throw new Error("Expected a published message")
    first.confirm(null)
    channel.emit("close")
    await failure
  })

  it("times out a batch with an unconfirmed message", async () => {
    vi.useFakeTimers()
    const { publisher } = setup()
    const result = publisher.publish(jobs)
    const failure = expect(result).rejects.toBeInstanceOf(
      DeliveryBatchInterruptedError,
    )
    await vi.advanceTimersByTimeAsync(5_000)
    await failure
  })

  it("waits for drain before sending more when the channel applies backpressure", async () => {
    const { channel, publisher } = setup()
    channel.hasRoom = false
    const result = publisher.publish(jobs)
    expect(channel.messages).toHaveLength(1)
    channel.hasRoom = true
    channel.emit("drain")
    await vi.waitFor(() => expect(channel.messages).toHaveLength(3))
    for (const message of channel.messages) message.confirm(null)
    await expect(result).resolves.toHaveLength(3)
  })

  it("interrupts a batch waiting for drain when the channel closes", async () => {
    const { channel, publisher } = setup()
    channel.hasRoom = false
    const result = publisher.publish(jobs)
    const failure = expect(result).rejects.toBeInstanceOf(
      DeliveryBatchInterruptedError,
    )
    channel.emit("close")
    await failure
    expect(channel.messages).toHaveLength(1)
  })
})
