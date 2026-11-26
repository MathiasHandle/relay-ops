import { calculateBackoff } from "@relay-ops/backend-shared/queue"

import type { DeliveryOutbox, Prisma } from "@relay-ops/app-db"
import type { FastifyBaseLogger } from "fastify"
import type {
  DeliveryPublisher,
  DeliveryPublishResult,
} from "./delivery-publisher"

const BATCH_SIZE = 20
const TRANSACTION_TIMEOUT_MS = 15_000

type SelectedRow = Pick<DeliveryOutbox, "id" | "deliveryId" | "attemptsCount">

type PublishDeliveryJobsParams = {
  deliveryPublisher: DeliveryPublisher
  logger: FastifyBaseLogger
  db: Prisma.TransactionClient
}

export async function publishDeliveryBatch(params: PublishDeliveryJobsParams) {
  const { deliveryPublisher, logger, db } = params

  return db.$transaction(
    async (tx) => {
      const rows = await findPendingBatch(tx)
      if (rows.length === 0) return "empty"

      const results = await deliveryPublisher.publish(
        rows.map((row) => ({ deliveryId: row.deliveryId })),
      )
      await savePublishResults({ tx, rows, results, logger })

      return "processed"
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  )
}

async function findPendingBatch(tx: Prisma.TransactionClient) {
  return tx.$queryRaw<SelectedRow[]>`
    SELECT id, delivery_id AS "deliveryId", attempts_count AS "attemptsCount"
    FROM delivery_outbox
    WHERE status = 'PENDING'
      AND next_attempt_at <= CURRENT_TIMESTAMP
    ORDER BY created_at, id
    LIMIT ${BATCH_SIZE}
    FOR UPDATE SKIP LOCKED
  `
}

type SavePublishResultsOptions = {
  tx: Prisma.TransactionClient
  rows: SelectedRow[]
  results: DeliveryPublishResult[]
  logger: FastifyBaseLogger
}

async function savePublishResults(options: SavePublishResultsOptions) {
  const { tx, rows, results, logger } = options
  const rowsByDeliveryId = new Map(rows.map((row) => [row.deliveryId, row]))

  // match selected rows to published results by deliveryId
  const matchedResults = results.map((result) => {
    const row = rowsByDeliveryId.get(result.deliveryId)
    if (!row) throw new Error("Publisher returned an unknown delivery")
    return { row, result }
  })

  const publishedIds: string[] = []
  for (const { row, result } of matchedResults) {
    if (result.kind === "published") {
      publishedIds.push(row.id)
    } else {
      logger.warn(
        {
          deliveryId: row.deliveryId,
          code: result.code,
          attemptsCount: row.attemptsCount + 1,
        },
        "Failed to publish delivery job",
      )

      // https://github.com/prisma/orm/discussions/20000
      // Re-scheduled rows have different data, so updateMany is not possible.
      await scheduleRetry({ tx, row, result })
    }
  }

  // mark successfully published outbox records as PUBLISHED
  if (publishedIds.length > 0) {
    await tx.deliveryOutbox.updateMany({
      where: { id: { in: publishedIds } },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    })
  }
}

const INITIAL_RETRY_DELAY_MS = 10_000
const MAX_RETRY_DELAY_MS = 5 * 60_000

type ScheduleRetryOptions = {
  tx: Prisma.TransactionClient
  row: SelectedRow
  result: Extract<DeliveryPublishResult, { kind: "failed" }>
}

async function scheduleRetry(options: ScheduleRetryOptions) {
  const { tx, row, result } = options

  const backOff = calculateBackoff({
    initialDelayMs: INITIAL_RETRY_DELAY_MS,
    multiplier: 2,
    maxDelayMs: MAX_RETRY_DELAY_MS,
    retryIndex: row.attemptsCount,
  })

  await tx.deliveryOutbox.update({
    where: { id: row.id },
    data: {
      nextAttemptAt: new Date(Date.now() + backOff),
      attemptsCount: { increment: 1 },
      lastError: result.code,
    },
  })
}
