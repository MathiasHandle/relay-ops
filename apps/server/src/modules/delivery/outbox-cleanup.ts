import type { Prisma } from "@relay-ops/app-db"

const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000 // 7 days
const CLEANUP_BATCH_SIZE = 100

type CleanupOptions = {
  db: Prisma.TransactionClient
}

/**
 * Deletes up to 100 published outbox records older than seven days.
 * @returns True if a full batch was deleted and more records may remain.
 */
export async function cleanupPublishedOutbox(options: CleanupOptions) {
  const { db } = options

  const cutoff = new Date(Date.now() - RETENTION_MS)
  const rows = await db.deliveryOutbox.findMany({
    where: { status: "PUBLISHED", publishedAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { publishedAt: "asc" },
    take: CLEANUP_BATCH_SIZE,
  })

  if (rows.length === 0) return false

  const result = await db.deliveryOutbox.deleteMany({
    where: {
      id: { in: rows.map((row) => row.id) },
      status: "PUBLISHED",
      publishedAt: { lt: cutoff },
    },
  })

  return result.count === CLEANUP_BATCH_SIZE
}
