import { beforeEach } from "vitest"
import { prisma } from "@relay-ops/app-db"

beforeEach(async () => {
  const [database] = await prisma.$queryRaw<{ name: string }[]>`
    SELECT current_database() AS name
  `

  if (!database?.name.endsWith("_test")) {
    throw new Error("Refusing to clean a database that is not a test database")
  }

  // give each integration test a clean database
  await prisma.$executeRaw`
    TRUNCATE TABLE
      "delivery_attempt",
      "delivery_outbox",
      "delivery",
      "event",
      "destination",
      "oauth_identity",
      "organization"
  `
})
