import { prisma } from "@relay-ops/app-db"
import { MAX_DELIVERY_ATTEMPTS } from "@relay-ops/backend-shared/queue"
import { HttpRequestError } from "@/shared/http/http-request.errors"
import { makeRequest } from "@/shared/http/make-request"
import {
  createDeliveryAttempt,
  findDelivery,
  updateDeliveryAttempt,
  updateDeliveryStatus,
} from "./delivery.repository"

import type { FastifyBaseLogger } from "fastify"

type ProcessDeliveryParams = {
  deliveryId: string
  logger: FastifyBaseLogger
}

export type ProcessDeliveryResult =
  | { kind: "delivered" }
  | { kind: "already-delivered" }
  | { kind: "already-failed" }
  | { kind: "not-found" }
  | { kind: "destination-disabled" }
  | { kind: "permanent-failure" }
  | { kind: "retryable-failure"; failedAttemptsCount: number }
  | { kind: "max-attempts-reached" }

export async function processDelivery(
  params: ProcessDeliveryParams,
): Promise<ProcessDeliveryResult> {
  const { deliveryId, logger } = params
  const delivery = await findDelivery({ db: prisma, deliveryId })

  // not found or already delivered deliveries
  if (!delivery) return { kind: "not-found" }
  if (delivery.status === "DELIVERED") {
    return { kind: "already-delivered" }
  }

  if (delivery.status === "FAILED") {
    return { kind: "already-failed" }
  }

  const deliveryLogger = logger.child({
    organizationId: delivery.organizationId,
    eventId: delivery.eventId,
  })

  // disabled or deleted destination
  if (!delivery.destination.enabled || delivery.destination.deletedAt) {
    await updateDeliveryStatus({ db: prisma, deliveryId, status: "FAILED" })
    deliveryLogger.info("Delivery stopped because destination is inactive")
    return { kind: "destination-disabled" }
  }

  // create DeliveryAttempt + make http request to destination
  const attempt = await createDeliveryAttempt({ db: prisma, deliveryId })
  const attemptLogger = deliveryLogger.child({ attemptId: attempt.id })
  const startedAt = performance.now()
  const result = await deliverPayload({
    logger: attemptLogger,
    url: delivery.destination.url,
    deliveryId,
    event: delivery.event,
  })

  // handle http failure
  if (result.kind === "failure") {
    return handleFailedAttempt({
      deliveryId,
      attemptId: attempt.id,
      previousFailedAttempts: delivery._count.deliveryAttempts,
      result,
      logger: attemptLogger,
      startedAt,
    })
  }

  // finish successfull delivery
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

type DeliveryHttpResult =
  | { kind: "success"; responseCode: number }
  | {
      kind: "failure"
      responseCode: number | null
      error: string
      shouldRetry: boolean
    }

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
      shouldRetry: true,
    }
  }

  const status = result.response.status
  const shouldRetry =
    status === 408 || status === 429 || (status >= 500 && status < 600)

  if (status < 200 || status >= 300) {
    return {
      kind: "failure",
      responseCode: status,
      error: "Destination returned a non-success HTTP status",
      shouldRetry,
    }
  }

  return { kind: "success", responseCode: status }
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

type FailDeliveryParams = {
  deliveryId: string
  attemptId: string
  responseCode: number | null
  error: string
}

async function failDelivery(params: FailDeliveryParams) {
  const { deliveryId, attemptId, responseCode, error } = params

  await prisma.$transaction(async (tx) => {
    await updateDeliveryAttempt({
      db: tx,
      deliveryId,
      attemptId,
      result: { status: "FAILED", responseCode, error },
    })

    await updateDeliveryStatus({ db: tx, deliveryId, status: "FAILED" })
  })
}

type HandleFailedAttemptParams = {
  deliveryId: string
  attemptId: string
  previousFailedAttempts: number
  result: Extract<DeliveryHttpResult, { kind: "failure" }>
  logger: FastifyBaseLogger
  startedAt: number
}

async function handleFailedAttempt(
  params: HandleFailedAttemptParams,
): Promise<ProcessDeliveryResult> {
  const {
    deliveryId,
    attemptId,
    previousFailedAttempts,
    result,
    logger,
    startedAt,
  } = params
  const failedAttemptsCount = previousFailedAttempts + 1
  const maxAttemptsReached = failedAttemptsCount >= MAX_DELIVERY_ATTEMPTS

  if (result.shouldRetry && !maxAttemptsReached) {
    // retryable failure and max attempts not reached
    await updateDeliveryAttempt({
      db: prisma,
      deliveryId,
      attemptId,
      result: {
        status: "FAILED",
        responseCode: result.responseCode,
        error: result.error,
      },
    })
  } else {
    // pernament failure or max attempts reached
    await failDelivery({
      deliveryId,
      attemptId,
      responseCode: result.responseCode,
      error: result.error,
    })
  }

  logger.warn(
    {
      responseCode: result.responseCode,
      duration: performance.now() - startedAt,
    },
    "Delivery attempt failed",
  )

  if (!result.shouldRetry) return { kind: "permanent-failure" }
  if (maxAttemptsReached) return { kind: "max-attempts-reached" }

  return { kind: "retryable-failure", failedAttemptsCount }
}
