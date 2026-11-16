import type { EventDeliveryStatus, Prisma } from "@relay-ops/app-db"

type DeliveryIdParams = {
  db: Prisma.TransactionClient
  deliveryId: string
}

export async function findDelivery(params: DeliveryIdParams) {
  const { db, deliveryId } = params

  return db.delivery.findUnique({
    where: { id: deliveryId },
    select: {
      status: true,
      organizationId: true,
      eventId: true,
      destination: { select: { url: true, enabled: true, deletedAt: true } },
      event: { select: { externalId: true, name: true, payload: true } },
      // failed attempts count - used for max attempts check and DLQ routing
      _count: {
        select: {
          deliveryAttempts: {
            where: { status: "FAILED" },
          },
        },
      },
    },
  })
}

type UpdateDeliveryStatusParams = DeliveryIdParams & {
  status: EventDeliveryStatus
}

export async function updateDeliveryStatus(params: UpdateDeliveryStatusParams) {
  const { db, deliveryId, status } = params

  await db.delivery.update({
    where: { id: deliveryId },
    data: { status },
  })
}

export async function createDeliveryAttempt(params: DeliveryIdParams) {
  const { db, deliveryId } = params

  return db.deliveryAttempt.create({
    data: { deliveryId, status: "IN_PROGRESS" },
    select: { id: true },
  })
}

type FinishedAttemptResult =
  | { status: "DELIVERED"; responseCode: number }
  | { status: "FAILED"; responseCode: number | null; error: string }

type UpdateDeliveryAttemptParams = DeliveryIdParams & {
  attemptId: string
  result: FinishedAttemptResult
}

export async function updateDeliveryAttempt(
  params: UpdateDeliveryAttemptParams,
) {
  const { db, deliveryId, attemptId, result } = params

  await db.deliveryAttempt.update({
    where: { id: attemptId, deliveryId },
    data: { ...result, finishedAt: new Date() },
  })
}
