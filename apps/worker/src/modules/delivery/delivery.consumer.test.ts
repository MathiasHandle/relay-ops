import Fastify from "fastify"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { startDeliveryConsumer } from "./delivery.consumer"
import { processDelivery } from "./delivery.service"

import type { Channel, ConsumeMessage } from "amqplib"

vi.mock("./delivery.service", () => ({ processDelivery: vi.fn() }))

const process = vi.mocked(processDelivery)
const consume = vi.fn<Channel["consume"]>()
const channel = { consume, ack: vi.fn(), nack: vi.fn(), reject: vi.fn() }
const retryPublisher = { publish: vi.fn() }
const logger = Fastify({ logger: false }).log
const message: ConsumeMessage = {
  content: Buffer.from(
    JSON.stringify({ deliveryId: "tz4a98xxat96iws9zmbrgj3a" }),
  ),
  fields: {
    consumerTag: "consumer-1",
    deliveryTag: 1,
    redelivered: false,
    exchange: "deliveries",
    routingKey: "delivery",
  },
  properties: {
    contentType: undefined,
    contentEncoding: undefined,
    headers: undefined,
    deliveryMode: undefined,
    priority: undefined,
    correlationId: undefined,
    replyTo: undefined,
    expiration: undefined,
    messageId: undefined,
    timestamp: undefined,
    type: undefined,
    userId: undefined,
    appId: undefined,
    clusterId: undefined,
  },
}

async function receive(input: ConsumeMessage | null) {
  await startDeliveryConsumer({ channel, logger, retryPublisher })
  const call = consume.mock.calls[0]
  if (!call) throw new Error("Consumer was not registered")
  await call[1](input)
}

beforeEach(() => {
  vi.resetAllMocks()
  consume.mockResolvedValue({ consumerTag: "consumer-1" })
  retryPublisher.publish.mockResolvedValue(undefined)
})

describe("delivery consumer", () => {
  it.each(["delivered", "already-delivered"] as const)(
    "acks %s",
    async (kind) => {
      process.mockResolvedValue({ kind })
      await receive(message)
      expect(process).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ deliveryId: "tz4a98xxat96iws9zmbrgj3a" }),
      )
      expect(channel.ack).toHaveBeenCalledExactlyOnceWith(message)
      expect(channel.nack).not.toHaveBeenCalled()
      expect(channel.reject).not.toHaveBeenCalled()
    },
  )

  it.each([
    "not-found",
    "destination-disabled",
    "already-failed",
    "permanent-failure",
    "max-attempts-reached",
  ] as const)("rejects %s without requeue", async (kind) => {
    process.mockResolvedValue({ kind })
    await receive(message)
    expect(channel.reject).toHaveBeenCalledExactlyOnceWith(message, false)
    expect(channel.ack).not.toHaveBeenCalled()
    expect(channel.nack).not.toHaveBeenCalled()
  })

  it.each([
    { count: 1, routingKey: "delivery.retry.10s" },
    { count: 2, routingKey: "delivery.retry.20s" },
    { count: 3, routingKey: "delivery.retry.40s" },
  ])(
    "publishes retry $count and acknowledges it",
    async ({ count, routingKey }) => {
      process.mockResolvedValue({
        kind: "retryable-failure",
        failedAttemptsCount: count,
      })
      await receive(message)
      expect(retryPublisher.publish).toHaveBeenCalledExactlyOnceWith({
        content: message.content,
        routingKey,
      })
      expect(channel.ack).toHaveBeenCalledExactlyOnceWith(message)
      expect(channel.nack).not.toHaveBeenCalled()
      expect(channel.reject).not.toHaveBeenCalled()
    },
  )

  it("does not acknowledge until the retry publish completes", async () => {
    let confirmPublish: () => void = () => {
      throw new Error("Publish has not started")
    }
    retryPublisher.publish.mockReturnValue(
      new Promise<void>((resolve) => {
        confirmPublish = resolve
      }),
    )
    process.mockResolvedValue({
      kind: "retryable-failure",
      failedAttemptsCount: 1,
    })

    const processing = receive(message)
    await vi.waitFor(() =>
      expect(retryPublisher.publish).toHaveBeenCalledOnce(),
    )
    expect(channel.ack).not.toHaveBeenCalled()
    confirmPublish()
    await processing
    expect(channel.ack).toHaveBeenCalledExactlyOnceWith(message)
  })

  it("requeues without acknowledging when the retry publish fails", async () => {
    process.mockResolvedValue({
      kind: "retryable-failure",
      failedAttemptsCount: 1,
    })
    retryPublisher.publish.mockRejectedValue(new Error("Publish failed"))
    await receive(message)
    expect(channel.nack).toHaveBeenCalledExactlyOnceWith(message, false, true)
    expect(channel.ack).not.toHaveBeenCalled()
    expect(channel.reject).not.toHaveBeenCalled()
  })

  it("requeues unexpected failures without acknowledging the job", async () => {
    process.mockRejectedValue(new Error("Database failed"))
    await receive(message)
    expect(channel.nack).toHaveBeenCalledExactlyOnceWith(message, false, true)
    expect(channel.ack).not.toHaveBeenCalled()
    expect(channel.reject).not.toHaveBeenCalled()
  })

  it.each(["invalid JSON", JSON.stringify({ unrelated: true })])(
    "rejects malformed jobs",
    async (content) => {
      const invalid = { ...message, content: Buffer.from(content) }
      await receive(invalid)
      expect(channel.reject).toHaveBeenCalledExactlyOnceWith(invalid, false)
      expect(channel.ack).not.toHaveBeenCalled()
      expect(channel.nack).not.toHaveBeenCalled()
      expect(process).not.toHaveBeenCalled()
    },
  )

  it("does not process broker cancellation as a job", async () => {
    await receive(null)
    expect(process).not.toHaveBeenCalled()
    expect(channel.ack).not.toHaveBeenCalled()
    expect(channel.nack).not.toHaveBeenCalled()
    expect(channel.reject).not.toHaveBeenCalled()
  })
})
