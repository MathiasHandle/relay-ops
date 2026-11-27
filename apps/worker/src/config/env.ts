import { z } from "zod"

const envSchema = z.object({
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  PORT: z.coerce.number().int().positive().default(3003),
  RABBITMQ_URL: z.url(),
})

export const env = envSchema.parse(process.env)
