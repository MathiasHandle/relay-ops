import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { processDelivery } from "./delivery.service"

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  create: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock("@relay-ops/app-db", () => ({
  prisma: {
    delivery: { findUnique: mocks.find },
    deliveryAttempt: { create: mocks.create },
  },
}))

const logger = Fastify({ logger: false }).log
const params = { deliveryId: "delivery-1", logger }
const activeDelivery = {
  status: "PENDING",
  organizationId: "org-1",
  eventId: "event-1",
  destination: {
    url: "https://example.com/hook",
    enabled: true,
    deletedAt: null,
  },
  event: { externalId: "external-1", name: "test", payload: {} },
  _count: { deliveryAttempts: 0 },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("fetch", mocks.fetch)
  mocks.find.mockResolvedValue(activeDelivery)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("processDelivery", () => {
  it("skips a missing delivery without creating an attempt or sending HTTP", async () => {
    mocks.find.mockResolvedValue(null)

    await expect(processDelivery(params)).resolves.toEqual({
      kind: "not-found",
    })

    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("does not send HTTP if creating the attempt fails", async () => {
    const error = new Error("DB unavailable")
    mocks.create.mockRejectedValue(error)
    await expect(processDelivery(params)).rejects.toBe(error)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
