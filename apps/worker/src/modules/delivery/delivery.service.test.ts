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
  _count: { deliveryAttempts: 0 },
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
  it.each([408, 429, 500, 503, 599])(
    "returns a retryable failure for HTTP %i",
    async (status) => {
      mocks.fetch.mockResolvedValue(new Response(null, { status }))

      await expect(processDelivery(params)).resolves.toEqual({
        kind: "retryable-failure",
        failedAttemptsCount: 1,
      })
      expect(mocks.finish).toHaveBeenCalledOnce()
      expect(mocks.transaction).not.toHaveBeenCalled()
    },
  )

  it.each([
    { status: 400, count: 0, kind: "permanent-failure" },
    { status: 503, count: 3, kind: "max-attempts-reached" },
  ] as const)(
    "finishes the delivery for $kind",
    async ({ status, count, kind }) => {
      const finish = vi.fn()
      const update = vi.fn()
      mocks.find.mockResolvedValue({
        ...activeDelivery,
        _count: { deliveryAttempts: count },
      })
      mocks.fetch.mockResolvedValue(new Response(null, { status }))
      mocks.transaction.mockImplementation(async (callback) =>
        callback({ deliveryAttempt: { update: finish }, delivery: { update } }),
      )

      await expect(processDelivery(params)).resolves.toEqual({ kind })
      expect(finish).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            responseCode: status,
          }),
        }),
      )
      expect(update).toHaveBeenCalledExactlyOnceWith({
        where: { id: params.deliveryId },
        data: { status: "FAILED" },
      })
      expect(mocks.finish).not.toHaveBeenCalled()
    },
  )

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
