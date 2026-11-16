import { randomUUID } from "node:crypto"
import Fastify from "fastify"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { prisma } from "@relay-ops/app-db"
import { createTestDelivery } from "@/test/factories"
import * as repository from "./delivery.repository"
import { processDelivery } from "./delivery.service"

const logger = Fastify({ logger: false }).log
const fetchMock = vi.fn<typeof fetch>()

function readDelivery(deliveryId: string) {
  return prisma.delivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: { deliveryAttempts: true },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe("processDelivery with PostgreSQL", () => {
  it("skips a missing delivery without sending HTTP", async () => {
    await expect(
      processDelivery({ deliveryId: randomUUID(), logger }),
    ).resolves.toEqual({ kind: "not-found" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { status: "DELIVERED", kind: "already-delivered" },
    { status: "FAILED", kind: "already-failed" },
  ] as const)(
    "leaves terminal $status deliveries unchanged even with an inactive destination",
    async ({ status, kind }) => {
      const { delivery } = await createTestDelivery({ status, enabled: false })
      const before = await readDelivery(delivery.id)

      await expect(
        processDelivery({ deliveryId: delivery.id, logger }),
      ).resolves.toEqual({ kind })

      expect(await readDelivery(delivery.id)).toEqual(before)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    { name: "disabled", enabled: false, deleted: false },
    { name: "deleted", enabled: false, deleted: true },
  ])("fails a $name destination without creating an attempt", async (state) => {
    const { delivery } = await createTestDelivery(state)

    await expect(
      processDelivery({ deliveryId: delivery.id, logger }),
    ).resolves.toEqual({ kind: "destination-disabled" })

    expect(await readDelivery(delivery.id)).toMatchObject({
      status: "FAILED",
      deliveryAttempts: [],
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends the event with its delivery identity and persists a successful attempt", async () => {
    const { delivery, destination, event } = await createTestDelivery()
    const unrelated = await createTestDelivery()
    const unrelatedBefore = await readDelivery(unrelated.delivery.id)
    let pendingAttemptsAtRequest = 0
    fetchMock.mockImplementation(async () => {
      pendingAttemptsAtRequest = await prisma.deliveryAttempt.count({
        where: { deliveryId: delivery.id, status: "IN_PROGRESS" },
      })
      return new Response(null, { status: 204 })
    })

    await expect(
      processDelivery({ deliveryId: delivery.id, logger }),
    ).resolves.toEqual({ kind: "delivered" })

    expect(pendingAttemptsAtRequest).toBe(1)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      destination.url,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RelayOps-Delivery-Id": delivery.id,
        },
        body: JSON.stringify({
          event: {
            externalId: event.externalId,
            name: event.name,
            payload: event.payload,
          },
          delivery: { id: delivery.id },
        }),
      }),
    )
    expect(await readDelivery(delivery.id)).toMatchObject({
      status: "DELIVERED",
      deliveryAttempts: [
        {
          deliveryId: delivery.id,
          status: "DELIVERED",
          responseCode: 204,
          error: null,
          finishedAt: expect.any(Date),
        },
      ],
    })
    expect(await readDelivery(unrelated.delivery.id)).toEqual(unrelatedBefore)
  })

  it("records HTTP 503 on one failed attempt and leaves the delivery pending", async () => {
    const { delivery } = await createTestDelivery()
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }))

    await expect(
      processDelivery({ deliveryId: delivery.id, logger }),
    ).resolves.toEqual({ kind: "retryable-failure", failedAttemptsCount: 1 })

    expect(await readDelivery(delivery.id)).toMatchObject({
      status: "PENDING",
      deliveryAttempts: [
        {
          deliveryId: delivery.id,
          status: "FAILED",
          responseCode: 503,
          error: "Destination returned a non-success HTTP status",
          finishedAt: expect.any(Date),
        },
      ],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("persists a generic transport error instead of the raw error text", async () => {
    const { delivery } = await createTestDelivery()
    fetchMock.mockRejectedValue(new Error("secret destination URL"))

    await expect(
      processDelivery({ deliveryId: delivery.id, logger }),
    ).resolves.toEqual({ kind: "retryable-failure", failedAttemptsCount: 1 })

    expect(await readDelivery(delivery.id)).toMatchObject({
      status: "PENDING",
      deliveryAttempts: [
        {
          deliveryId: delivery.id,
          status: "FAILED",
          responseCode: null,
          error: "Delivery HTTP request failed",
          finishedAt: expect.any(Date),
        },
      ],
    })
  })

  it("stops after four completed temporary failures on one delivery", async () => {
    const { delivery } = await createTestDelivery()
    const params = { deliveryId: delivery.id, logger }
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }))

    for (const count of [1, 2, 3]) {
      await expect(processDelivery(params)).resolves.toEqual({
        kind: "retryable-failure",
        failedAttemptsCount: count,
      })
      const current = await readDelivery(delivery.id)
      expect(current.status).toBe("PENDING")
      expect(current.deliveryAttempts).toHaveLength(count)
    }

    await expect(processDelivery(params)).resolves.toEqual({
      kind: "max-attempts-reached",
    })
    const completed = await readDelivery(delivery.id)
    expect(completed.status).toBe("FAILED")
    expect(completed.deliveryAttempts).toHaveLength(4)
    expect(
      completed.deliveryAttempts.every(
        (attempt) => attempt.status === "FAILED",
      ),
    ).toBe(true)
    await expect(processDelivery(params)).resolves.toEqual({
      kind: "already-failed",
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("stops on a permanent HTTP error without retrying", async () => {
    const { delivery } = await createTestDelivery()
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }))

    await expect(
      processDelivery({ deliveryId: delivery.id, logger }),
    ).resolves.toEqual({
      kind: "permanent-failure",
    })
    expect(await readDelivery(delivery.id)).toMatchObject({
      status: "FAILED",
      deliveryAttempts: [{ status: "FAILED", responseCode: 400 }],
    })
  })

  it("does not count an unfinished attempt towards the retry limit", async () => {
    const { delivery } = await createTestDelivery()
    await prisma.deliveryAttempt.create({
      data: { deliveryId: delivery.id, status: "IN_PROGRESS" },
    })
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }))

    await expect(
      processDelivery({ deliveryId: delivery.id, logger }),
    ).resolves.toEqual({
      kind: "retryable-failure",
      failedAttemptsCount: 1,
    })
    const current = await readDelivery(delivery.id)
    expect(current.status).toBe("PENDING")
    expect(current.deliveryAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "IN_PROGRESS", finishedAt: null }),
        expect.objectContaining({ status: "FAILED", responseCode: 503 }),
      ]),
    )
  })

  it("persists a timeout as a finished failed attempt", async () => {
    const { delivery } = await createTestDelivery()
    const controller = new AbortController()
    const timeout = new DOMException("Timed out", "TimeoutError")
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal)
    fetchMock.mockImplementation(() => {
      controller.abort(timeout)
      return Promise.reject(timeout)
    })

    await expect(
      processDelivery({ deliveryId: delivery.id, logger }),
    ).resolves.toEqual({ kind: "retryable-failure", failedAttemptsCount: 1 })

    expect(await readDelivery(delivery.id)).toMatchObject({
      status: "PENDING",
      deliveryAttempts: [
        {
          deliveryId: delivery.id,
          status: "FAILED",
          responseCode: null,
          error: "Delivery HTTP request timed out",
          finishedAt: expect.any(Date),
        },
      ],
    })
  })

  it("does not send or create an attempt when a successful delivery is processed again", async () => {
    const { delivery } = await createTestDelivery()
    const params = { deliveryId: delivery.id, logger }
    await expect(processDelivery(params)).resolves.toEqual({
      kind: "delivered",
    })
    const before = await readDelivery(delivery.id)

    await expect(processDelivery(params)).resolves.toEqual({
      kind: "already-delivered",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await readDelivery(delivery.id)).toEqual(before)
  })

  it("keeps delivery identity and the failed attempt when a later attempt succeeds", async () => {
    const { delivery, organization } = await createTestDelivery()
    const params = { deliveryId: delivery.id, logger }
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(processDelivery(params)).resolves.toEqual({
      kind: "retryable-failure",
      failedAttemptsCount: 1,
    })
    const first = await readDelivery(delivery.id)

    await expect(processDelivery(params)).resolves.toEqual({
      kind: "delivered",
    })

    const stored = await readDelivery(delivery.id)
    expect(stored.status).toBe("DELIVERED")
    expect(stored.deliveryAttempts).toHaveLength(2)
    expect(stored.deliveryAttempts).toEqual(
      expect.arrayContaining([
        ...first.deliveryAttempts,
        expect.objectContaining({
          deliveryId: delivery.id,
          status: "DELIVERED",
          responseCode: 204,
          finishedAt: expect.any(Date),
        }),
      ]),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]).toEqual([
      fetchMock.mock.calls[0]?.[0],
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-RelayOps-Delivery-Id": delivery.id,
        },
        body: fetchMock.mock.calls[0]?.[1]?.body,
      }),
    ])
    expect(
      await prisma.delivery.count({
        where: { organizationId: organization.id },
      }),
    ).toBe(1)
    expect(
      await prisma.event.count({ where: { organizationId: organization.id } }),
    ).toBe(1)
  })

  it("rolls back attempt completion when the delivery update fails", async () => {
    const { delivery } = await createTestDelivery()
    const error = new Error("Delivery update failed")
    let completedAttemptsInTransaction = 0
    // Only the second operation fails; Prisma and the first transaction write are real.
    vi.spyOn(repository, "updateDeliveryStatus").mockImplementationOnce(
      async (params) => {
        completedAttemptsInTransaction = await params.db.deliveryAttempt.count({
          where: { deliveryId: delivery.id, status: "DELIVERED" },
        })
        throw error
      },
    )

    await expect(
      processDelivery({ deliveryId: delivery.id, logger }),
    ).rejects.toBe(error)

    expect(completedAttemptsInTransaction).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await readDelivery(delivery.id)).toMatchObject({
      status: "PENDING",
      deliveryAttempts: [
        {
          deliveryId: delivery.id,
          status: "IN_PROGRESS",
          responseCode: null,
          error: null,
          finishedAt: null,
        },
      ],
    })
  })
})
