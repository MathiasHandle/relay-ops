import { z } from "zod"

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),

  // JWKS of apps/auth (public signing keys).
  AUTH_JWKS_URL: z.url(),
  // Must match apps/auth exactly (`iss` and `aud` claims).
  JWT_ISSUER: z.url(),
  JWT_AUDIENCE: z.string().min(1),

  RABBITMQ_URL: z.url(),

  MAX_REQUESTS: z.coerce.number().int().positive().default(60),
  MAX_REQUEST_TIME_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
})

export const env = envSchema.parse(process.env)
