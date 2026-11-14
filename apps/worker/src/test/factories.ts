import { randomUUID } from "node:crypto"
import { prisma } from "@relay-ops/app-db"

import type { EventDeliveryStatus } from "@relay-ops/app-db"

type CreateTestDeliveryOptions = {
  status?: EventDeliveryStatus
  enabled?: boolean
  deleted?: boolean
  url?: string
}

export async function createTestDelivery(
  options: CreateTestDeliveryOptions = {},
) {
  const {
    status = "PENDING",
    enabled = true,
    deleted = false,
    url = "https://destination.test/hook",
  } = options

  const organization = await prisma.organization.create({
    data: { name: `worker-test-${randomUUID()}` },
  })
  const destination = await prisma.destination.create({
    data: {
      organizationId: organization.id,
      humanReadableId: `destination-${randomUUID()}`,
      url,
      enabled: deleted ? false : enabled,
      deletedAt: deleted ? new Date() : null,
    },
  })
  const event = await prisma.event.create({
    data: {
      organizationId: organization.id,
      externalId: randomUUID(),
      name: "order.created",
      payload: { orderId: 42, items: [{ sku: "A-1", quantity: 2 }] },
    },
  })
  const delivery = await prisma.delivery.create({
    data: {
      organizationId: organization.id,
      eventId: event.id,
      destinationId: destination.id,
      status,
    },
  })

  return { organization, destination, event, delivery }
}
