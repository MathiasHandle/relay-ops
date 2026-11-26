import { calculateBackoff } from "./backoff"

import type { Channel } from "amqplib"

export const MAX_DELIVERY_ATTEMPTS = 4

const RETRY_BASE_DELAY_SECONDS = 10
const RETRY_MULTIPLIER = 2

function createRetryQueues() {
  return Array.from({ length: MAX_DELIVERY_ATTEMPTS - 1 }, (_, index) => {
    const delaySeconds =
      calculateBackoff({
        initialDelayMs: RETRY_BASE_DELAY_SECONDS * 1000,
        multiplier: RETRY_MULTIPLIER,
        maxDelayMs: Number.POSITIVE_INFINITY,
        retryIndex: index,
      }) / 1000

    return {
      queue: `deliveries.retry.${delaySeconds}s.v1`,
      routingKey: `delivery.retry.${delaySeconds}s`,
      ttlMs: delaySeconds * 1_000,
    }
  })
}

// When adding or changing queue or exchange names, check the setup Job permissions
// in infra/src/apps/rabbitmq/setup.mjs; keep new topologies in sync as well.
export const DELIVERY_TOPOLOGY = {
  process: {
    exchange: "deliveries",
    exchangeType: "direct",
    queue: "deliveries.process.v1",
    routingKey: "delivery",
  },
  retry: {
    exchange: "deliveries.retry",
    exchangeType: "direct",
    queues: createRetryQueues(),
  },
  dead: {
    exchange: "deliveries.dead",
    exchangeType: "direct",
    queue: "deliveries.dead.letter.v1",
    routingKey: "delivery.dead.letter",
  },
} as const

type AssertDeliveryTopologyParams = {
  channel: Channel
}

export async function assertDeliveryTopology(
  params: AssertDeliveryTopologyParams,
) {
  const { channel } = params
  const { process, retry, dead } = DELIVERY_TOPOLOGY

  // process
  await channel.assertExchange(process.exchange, process.exchangeType, {
    durable: true,
  })
  await channel.assertQueue(process.queue, {
    durable: true,
    deadLetterExchange: dead.exchange,
    deadLetterRoutingKey: dead.routingKey,
  })
  await channel.bindQueue(process.queue, process.exchange, process.routingKey)

  // retry
  await channel.assertExchange(retry.exchange, retry.exchangeType, {
    durable: true,
  })
  for (const retryQueue of retry.queues) {
    await channel.assertQueue(retryQueue.queue, {
      durable: true,
      messageTtl: retryQueue.ttlMs,
      deadLetterExchange: process.exchange,
      deadLetterRoutingKey: process.routingKey,
    })

    await channel.bindQueue(
      retryQueue.queue,
      retry.exchange,
      retryQueue.routingKey,
    )
  }

  // dead letter
  await channel.assertExchange(dead.exchange, dead.exchangeType, {
    durable: true,
  })
  await channel.assertQueue(dead.queue, { durable: true })
  await channel.bindQueue(dead.queue, dead.exchange, dead.routingKey)

  return {
    channel,
  }
}
