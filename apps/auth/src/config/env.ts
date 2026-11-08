import { z } from "zod"

const envSchema = z.object({
  AUTH_DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3002),
  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_ISSUER: z.url(),
  JWT_AUDIENCE: z.string().min(1),
})

export const env = envSchema.parse(process.env)
