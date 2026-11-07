import { PrismaPg } from "@prisma/adapter-pg"
import { env } from "./env"
import { PrismaClient } from "./generated/prisma/client"

export function createPrismaClient(connectionString = env.APP_DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

export const prisma = createPrismaClient()
