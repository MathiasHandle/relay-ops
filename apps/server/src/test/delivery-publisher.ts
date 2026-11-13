import type { DeliveryJob } from "@relay-ops/backend-shared/queue"
import type { DeliveryPublisher } from "@/shared/queue/delivery-publisher"

/**
 * In-memory `DeliveryPublisher` for tests: `buildApp({ deliveryPublisher })`
 * skips RabbitMQ and every published job lands in `published`.
 */
export function createFakeDeliveryPublisher() {
  const published: DeliveryJob[] = []

  const publisher: DeliveryPublisher = {
    publish: async (jobs) => {
      published.push(...jobs)
    },
  }

  return { publisher, published }
}
