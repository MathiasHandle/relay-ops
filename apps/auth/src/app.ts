import cors from "@fastify/cors"
import formbody from "@fastify/formbody"
import rateLimit from "@fastify/rate-limit"
import Fastify from "fastify"
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod"
import { env } from "@/config/env"
import { healthModule } from "@/modules/health"
import { keysModule, loadSigningKey } from "@/modules/keys"
import { oauthModule } from "@/modules/oauth"
import { prisma } from "@/shared/db/prisma"
import { errorHandler, notFoundHandler } from "@/shared/errors/error-handler"

type BuildAppOptions = {
  // disabled in tests
  logger: boolean
}

export const buildApp = async ({ logger }: BuildAppOptions) => {
  const app = Fastify({ logger })

  // Validate and serialize route schemas with Zod.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Default error handler for all routes; plugins may override it.
  app.setErrorHandler(errorHandler)

  await app.register(cors, {
    origin: ["https://hoppscotch.io"],
    exposedHeaders: [
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-reset",
      "retry-after",
    ],
  })

  // Parse application/x-www-form-urlencoded bodies (required by OAuth /token).
  await app.register(formbody)

  await app.register(rateLimit, {
    max: env.MAX_REQUESTS,
    timeWindow: env.MAX_REQUEST_TIME_WINDOW_MS,
  })

  // separate per-IP rate limit for unknown routes
  app.setNotFoundHandler(
    { preHandler: app.rateLimit({ max: 10, timeWindow: 60_000 }) },
    notFoundHandler,
  )

  app.addHook("onClose", async () => {
    await prisma.$disconnect()
  })

  const signingKey = await loadSigningKey(env.JWT_PRIVATE_KEY_PATH)

  await app.register(healthModule)
  await app.register(keysModule, { signingKey })
  await app.register(oauthModule, { prefix: "/oauth", signingKey })

  return app
}
