import { PrismaPg } from "@prisma/adapter-pg"
import { env } from "@/config/env"
import { PrismaClient } from "../../../prisma/.generated/client"

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.AUTH_DATABASE_URL }),
})
