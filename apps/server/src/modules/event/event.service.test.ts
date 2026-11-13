import Fastify from "fastify"
import { describe, expect, it, vi } from "vitest"
import { createFakeDeliveryPublisher } from "@/test/delivery-publisher"
import { MissingDestinationError } from "./event.errors"
import { createEvent } from "./event.service"

vi.mock("@relay-ops/app-db", () => ({ prisma: {} }))

describe("createEvent", () => {
  it("rejects an event without destinations before touching the database", async () => {
    const { log } = Fastify({ logger: false })

    const result = createEvent({
      organizationId: "org-1",
      requested: {
        event: { externalId: "ext-1", name: "order.created", payload: {} },
        destinations: [],
      },
      logger: log,
      deliveryPublisher: createFakeDeliveryPublisher().publisher,
    })

    await expect(result).rejects.toBeInstanceOf(MissingDestinationError)
  })
})
