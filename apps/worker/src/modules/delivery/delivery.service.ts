import { prisma } from "@relay-ops/app-db"
import { HttpRequestError } from "@/shared/http/http-request.errors"
import { makeRequest } from "@/shared/http/make-request"
import {
  createDeliveryAttempt,
  findDelivery,
  updateDeliveryAttempt,
  updateDeliveryStatus,
} from "./delivery.repository"

import type { FastifyBaseLogger } from "fastify"

type DeliveryHttpResult =
  | { kind: "success"; responseCode: number }
  | { kind: "failure"; responseCode: number | null; error: string }

type DeliveryPayloadParams = {
  logger: FastifyBaseLogger
  url: string
  deliveryId: string
  event: { externalId: string; name: string; payload: unknown }
}

async function deliverPayload(
  params: DeliveryPayloadParams,
): Promise<DeliveryHttpResult> {
  const { url, deliveryId, event, logger } = params

  const body = JSON.stringify({ event, delivery: { id: deliveryId } })
  let result: Awaited<ReturnType<typeof makeRequest>>

  try {
    result = await makeRequest({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RelayOps-Delivery-Id": deliveryId,
      },
      body,
      timeoutMs: 10_000,
      logger,
    })
  } catch (error) {
    if (!(error instanceof HttpRequestError)) throw error

    return {
      kind: "failure",
      responseCode: null,
      error:
        error.reason === "timeout"
          ? "Delivery HTTP request timed out"
          : "Delivery HTTP request failed",
    }
  }

  if (result.response.status < 200 || result.response.status >= 300) {
    return {
      kind: "failure",
      responseCode: result.response.status,
      error: "Destination returned a non-success HTTP status",
    }
  }

  return { kind: "success", responseCode: result.response.status }
}

type CompleteDeliveryParams = {
  deliveryId: string
  attemptId: string
  responseCode: number
}

async function completeDelivery(params: CompleteDeliveryParams) {
  const { deliveryId, attemptId, responseCode } = params
  await prisma.$transaction(async (tx) => {
    await updateDeliveryAttempt({
      db: tx,
      deliveryId,
      attemptId,
      result: { status: "DELIVERED", responseCode },
    })
    await updateDeliveryStatus({ db: tx, deliveryId, status: "DELIVERED" })
  })
}

export type ProcessDeliveryResult =
  | { kind: "delivered" }
  | { kind: "already-finished" }
  | { kind: "not-found" }
  | { kind: "destination-disabled" }
  | { kind: "attempt-failed" }

type ProcessDeliveryParams = {
  deliveryId: string
  logger: FastifyBaseLogger
}

export async function processDelivery(
  params: ProcessDeliveryParams,
): Promise<ProcessDeliveryResult> {
  const { deliveryId, logger } = params
  const delivery = await findDelivery({ db: prisma, deliveryId })

  if (!delivery) return { kind: "not-found" }
  if (delivery.status === "DELIVERED" || delivery.status === "FAILED") {
    return { kind: "already-finished" }
  }

  const deliveryLogger = logger.child({
    organizationId: delivery.organizationId,
    eventId: delivery.eventId,
  })

  if (!delivery.destination.enabled || delivery.destination.deletedAt) {
    await updateDeliveryStatus({ db: prisma, deliveryId, status: "FAILED" })
    deliveryLogger.info("Delivery stopped because destination is inactive")
    return { kind: "destination-disabled" }
  }

  const attempt = await createDeliveryAttempt({ db: prisma, deliveryId })
  const attemptLogger = deliveryLogger.child({ attemptId: attempt.id })
  const startedAt = performance.now()
  const result = await deliverPayload({
    logger: attemptLogger,
    url: delivery.destination.url,
    deliveryId,
    event: delivery.event,
  })

  if (result.kind === "failure") {
    await updateDeliveryAttempt({
      db: prisma,
      deliveryId,
      attemptId: attempt.id,
      result: {
        status: "FAILED",
        responseCode: result.responseCode,
        error: result.error,
      },
    })
    attemptLogger.warn(
      {
        responseCode: result.responseCode,
        duration: performance.now() - startedAt,
      },
      "Delivery attempt failed",
    )
    return { kind: "attempt-failed" }
  }

  await completeDelivery({
    deliveryId,
    attemptId: attempt.id,
    responseCode: result.responseCode,
  })

  attemptLogger.info(
    {
      responseCode: result.responseCode,
      duration: performance.now() - startedAt,
    },
    "Delivery result saved",
  )
  return { kind: "delivered" }
}
