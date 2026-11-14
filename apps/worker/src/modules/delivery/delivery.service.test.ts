import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { processDelivery } from "./delivery.service"

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  create: vi.fn(),
  finish: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock("@relay-ops/app-db", () => ({
  prisma: {
    delivery: { findUnique: mocks.find, update: mocks.update },
    deliveryAttempt: { create: mocks.create, update: mocks.finish },
    $transaction: mocks.transaction,
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
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("fetch", mocks.fetch)
  mocks.find.mockResolvedValue(activeDelivery)
  mocks.create.mockResolvedValue({ id: "attempt-1" })
  mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("processDelivery", () => {
  it("propagates unexpected request setup errors without failing the attempt", async () => {
    const error = new Error("Unexpected setup error")
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      throw error
    })
    await expect(processDelivery(params)).rejects.toBe(error)
    expect(mocks.finish).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("does not send HTTP if creating the attempt fails", async () => {
    const error = new Error("DB unavailable")
    mocks.create.mockRejectedValue(error)
    await expect(processDelivery(params)).rejects.toBe(error)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("propagates transaction failure without recording an HTTP failure", async () => {
    const error = new Error("Transaction failed")
    mocks.transaction.mockRejectedValue(error)
    await expect(processDelivery(params)).rejects.toBe(error)
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  it("propagates failure to save an unsuccessful attempt", async () => {
    const error = new Error("DB unavailable")
    mocks.fetch.mockRejectedValue(new Error("Network failed"))
    mocks.finish.mockRejectedValue(error)
    await expect(processDelivery(params)).rejects.toBe(error)
  })
})
