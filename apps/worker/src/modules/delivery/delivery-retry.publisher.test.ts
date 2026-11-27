import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"
import { createRetryPublisher } from "./delivery-retry.publisher"

import type { ConfirmChannel, Options } from "amqplib"

class FakeConfirmChannel extends EventEmitter {
  readonly published: {
    exchange: string
    routingKey: string
    content: Buffer
    options: Options.Publish
    confirm: (error: Error | null) => void
  }[] = []

  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: Options.Publish,
    confirm: (error: Error | null) => void,
  ) {
    this.published.push({ exchange, routingKey, content, options, confirm })
    return true
  }
}

function setup() {
  const channel = new FakeConfirmChannel()
  // The publisher uses only the event and confirm-publish parts of amqplib's channel.
  const publisher = createRetryPublisher({
    channel: channel as unknown as ConfirmChannel,
  })
  return { channel, publisher }
}

function publishedAt(channel: FakeConfirmChannel, index: number) {
  const published = channel.published[index]
  if (!published) throw new Error("Expected a published message")
  return published
}

describe("retry publisher", () => {
  it("waits for the broker confirm and publishes a persistent mandatory message", async () => {
    const { channel, publisher } = setup()
    const content = Buffer.from("job")
    const result = publisher.publish({
      content,
      routingKey: "delivery.retry.10s",
    })
    const published = publishedAt(channel, 0)
    expect(published).toMatchObject({
      exchange: "deliveries.retry",
      routingKey: "delivery.retry.10s",
      content,
      options: {
        persistent: true,
        mandatory: true,
        contentType: "application/json",
      },
    })
    published.confirm(null)
    await expect(result).resolves.toBeUndefined()
  })

  it("rejects a returned message even when the broker confirms it", async () => {
    const { channel, publisher } = setup()
    const result = publisher.publish({
      content: Buffer.from("job"),
      routingKey: "missing",
    })
    const published = publishedAt(channel, 0)
    channel.emit("return", {
      properties: { messageId: published.options.messageId },
    })
    published.confirm(null)
    await expect(result).rejects.toThrow("Retry message could not be routed")
  })

  it("propagates a failed confirm", async () => {
    const { channel, publisher } = setup()
    const result = publisher.publish({
      content: Buffer.from("job"),
      routingKey: "delivery.retry.10s",
    })
    const error = new Error("channel closed")
    publishedAt(channel, 0).confirm(error)
    await expect(result).rejects.toBe(error)
  })

  it("times out an unconfirmed publish", async () => {
    vi.useFakeTimers()
    try {
      const { publisher } = setup()
      const result = publisher.publish({
        content: Buffer.from("job"),
        routingKey: "delivery.retry.10s",
      })
      const timeoutAssertion = expect(result).rejects.toThrow(
        "Retry publish confirm timed out",
      )

      await vi.advanceTimersByTimeAsync(5_000)
      await timeoutAssertion
    } finally {
      vi.useRealTimers()
    }
  })

  it("associates a return with the correct concurrent publish", async () => {
    const { channel, publisher } = setup()
    const first = publisher.publish({
      content: Buffer.from("first"),
      routingKey: "delivery.retry.10s",
    })
    const second = publisher.publish({
      content: Buffer.from("second"),
      routingKey: "missing",
    })
    const firstMessage = publishedAt(channel, 0)
    const secondMessage = publishedAt(channel, 1)
    expect(firstMessage.options.messageId).not.toBe(
      secondMessage.options.messageId,
    )
    channel.emit("return", {
      properties: { messageId: secondMessage.options.messageId },
    })
    secondMessage.confirm(null)
    firstMessage.confirm(null)
    await expect(first).resolves.toBeUndefined()
    await expect(second).rejects.toThrow("Retry message could not be routed")
  })
})
