import type { Channel } from "amqplib"

export const DELIVERY_TOPOLOGY = {
  exchange: "deliveries",
  exchangeType: "direct",
  queue: "deliveries.process.v1",
  routingKey: "delivery",
} as const

type AssertDeliveryTopologyParams = {
  channel: Channel
}

export async function assertDeliveryTopology(
  params: AssertDeliveryTopologyParams,
) {
  const { channel } = params

  await channel.assertExchange(
    DELIVERY_TOPOLOGY.exchange,
    DELIVERY_TOPOLOGY.exchangeType,
    { durable: true },
  )
  await channel.assertQueue(DELIVERY_TOPOLOGY.queue, { durable: true })
  await channel.bindQueue(
    DELIVERY_TOPOLOGY.queue,
    DELIVERY_TOPOLOGY.exchange,
    DELIVERY_TOPOLOGY.routingKey,
  )

  // at most one unacknowledged message at a time per consumer
  await channel.prefetch(1)

  return {
    channel,
  }
}
