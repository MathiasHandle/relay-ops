import { z } from "zod"

const envSchema = z.object({
  AUTH_DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3002),
})

export const env = envSchema.parse(process.env)
