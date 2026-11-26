import { randomUUID } from "node:crypto"
import Fastify from "fastify"
import { describe, expect, it, vi } from "vitest"
import { prisma } from "@relay-ops/app-db"
import { createTestDestination, createTestTenant } from "@/test/factories"
import { cleanupPublishedOutbox } from "./outbox-cleanup"
import { publishDeliveryBatch } from "./outbox-publisher"

import type { DeliveryPublisher } from "./delivery-publisher"

const logger = Fastify({ logger: false }).log

async function createOutbox(count: number) {
  const { organization } = await createTestTenant()
  const event = await prisma.event.create({
    data: {
      organizationId: organization.id,
      externalId: randomUUID(),
      name: "test",
      payload: {},
    },
  })
  const deliveries = []
  for (let index = 0; index < count; index++) {
    const destination = await createTestDestination({
      organizationId: organization.id,
    })
    const delivery = await prisma.delivery.create({
      data: {
        eventId: event.id,
        destinationId: destination.id,
        organizationId: organization.id,
      },
    })
    deliveries.push(delivery)
  }
  await prisma.deliveryOutbox.createMany({
    data: deliveries.map((delivery) => ({
      deliveryId: delivery.id,
      createdAt: new Date("1900-01-01T00:00:00Z"),
      nextAttemptAt: new Date("1900-01-01T00:00:00Z"),
    })),
  })
  return deliveries.map((delivery) => delivery.id)
}

describe("outbox batch", () => {
  it("cleans up old published rows while keeping recent and pending rows", async () => {
    const ids = await createOutbox(3)
    const [oldId, recentId, pendingId] = ids

    await prisma.deliveryOutbox.update({
      where: { deliveryId: oldId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date("1900-01-01T00:00:00Z"),
      },
    })
    await prisma.deliveryOutbox.update({
      where: { deliveryId: recentId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    })
    await prisma.deliveryOutbox.update({
      where: { deliveryId: pendingId },
      data: { nextAttemptAt: new Date("2100-01-01T00:00:00Z") },
    })

    await cleanupPublishedOutbox({ db: prisma })

    expect(
      await prisma.deliveryOutbox.findUnique({ where: { deliveryId: oldId } }),
    ).toBeNull()

    expect(
      await prisma.deliveryOutbox.findUnique({
        where: { deliveryId: recentId },
      }),
    ).not.toBeNull()

    expect(
      await prisma.deliveryOutbox.findUnique({
        where: { deliveryId: pendingId },
      }),
    ).not.toBeNull()
  })

  it("commits confirmed messages and schedules only failed messages", async () => {
    const ids = await createOutbox(3)
    const publisher: DeliveryPublisher = {
      publish: async (jobs) =>
        jobs.map((job, index) =>
          index === 1
            ? { deliveryId: job.deliveryId, kind: "failed", code: "UNROUTABLE" }
            : { deliveryId: job.deliveryId, kind: "published" },
        ),
    }

    await expect(
      publishDeliveryBatch({
        db: prisma,
        deliveryPublisher: publisher,
        logger,
      }),
    ).resolves.toBe("processed")

    const rows = await prisma.deliveryOutbox.findMany({
      where: { deliveryId: { in: ids } },
    })
    expect(rows.filter((row) => row.status === "PUBLISHED")).toHaveLength(2)

    const failed = rows.find((row) => row.status === "PENDING")
    expect(failed).toMatchObject({
      attemptsCount: 1,
      lastError: "UNROUTABLE",
      publishedAt: null,
    })
    expect(failed?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
  })

  it("rolls back the batch if the channel fails after a partial confirm", async () => {
    const ids = await createOutbox(2)

    const publisher: DeliveryPublisher = {
      publish: vi.fn().mockRejectedValue(new Error("channel closed")),
    }

    await expect(
      publishDeliveryBatch({
        db: prisma,
        deliveryPublisher: publisher,
        logger,
      }),
    ).rejects.toThrow("channel closed")

    const rows = await prisma.deliveryOutbox.findMany({
      where: { deliveryId: { in: ids } },
    })
    for (const row of rows) {
      expect(row).toMatchObject({
        status: "PENDING",
        attemptsCount: 0,
        publishedAt: null,
      })
    }

    await prisma.deliveryOutbox.updateMany({
      where: { deliveryId: { in: ids } },
      data: { nextAttemptAt: new Date("2100-01-01T00:00:00Z") },
    })
  })

  it("lets two publishers select separate locked batches", async () => {
    // Create more rows than one batch can select.
    const ids = await createOutbox(21)

    // Hold both transactions open until their selected batches are checked.
    let release: () => void = () => {
      throw new Error("Barrier not initialized")
    }
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })

    // Record each batch and simulate successful publishing after the barrier opens.
    const selected: string[][] = []
    const publisher: DeliveryPublisher = {
      publish: async (jobs) => {
        selected.push(jobs.map((job) => job.deliveryId))
        await barrier
        return jobs.map((job) => ({
          deliveryId: job.deliveryId,
          kind: "published",
        }))
      },
    }

    // Start the first publisher and wait until it has locked its batch.
    const first = publishDeliveryBatch({
      db: prisma,
      deliveryPublisher: publisher,
      logger,
    })
    const firstSettled = Promise.allSettled([first])
    let second: ReturnType<typeof publishDeliveryBatch> | undefined
    let secondSettled: Promise<unknown> | undefined

    try {
      await vi.waitFor(() => expect(selected).toHaveLength(1))

      // The second publisher must skip the rows locked by the first transaction.
      second = publishDeliveryBatch({
        db: prisma,
        deliveryPublisher: publisher,
        logger,
      })
      secondSettled = Promise.allSettled([second])

      // Check both batch sizes and ensure no delivery was selected twice.
      await vi.waitFor(() => expect(selected).toHaveLength(2))
      expect(
        selected.map((batch) => batch.length).sort((a, b) => a - b),
      ).toEqual([1, 20])
      expect(new Set(selected.flat()).size).toBe(21)
    } finally {
      // Unblock and wait for both publishers even if an assertion fails.
      release()
      await Promise.all([firstSettled, secondSettled])
    }

    // Wait for both transactions to commit and verify this test's rows.
    await Promise.all([first, second])
    expect(
      await prisma.deliveryOutbox.count({
        where: { deliveryId: { in: ids }, status: "PUBLISHED" },
      }),
    ).toBe(21)
  })
})
