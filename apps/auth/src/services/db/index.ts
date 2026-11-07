import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../../prisma/.generated/client"
import { env } from "../../env"

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.AUTH_DATABASE_URL }),
})
