import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import Fastify from "fastify"
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod"
import { prisma } from "@relay-ops/app-db"
import { env } from "@/config/env"
import { eventModule } from "@/modules/event"
import { healthModule } from "@/modules/health"
import { meModule } from "@/modules/me"
import { authenticate } from "@/shared/auth/authenticate"
import { errorHandler, notFoundHandler } from "@/shared/errors/error-handler"
import { SWAGGER_OPTIONS, SWAGGER_UI_OPTIONS } from "@/shared/swagger"

type BuildAppOptions = {
  // disabled in tests
  logger: boolean
}

export const buildApp = async (options: BuildAppOptions) => {
  const { logger } = options

  const app = Fastify({ logger: logger ? { level: env.LOG_LEVEL } : false })

  // Validate and serialize route schemas with Zod.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Default error handler for all routes; plugins may override it.
  app.setErrorHandler(errorHandler)

  // Browser-based API clients for manual testing.
  await app.register(cors, {
    origin: ["https://hoppscotch.io"],
    exposedHeaders: [
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-reset",
      "retry-after",
    ],
  })

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

  // swagger
  await app.register(swagger, SWAGGER_OPTIONS)
  await app.register(swaggerUi, SWAGGER_UI_OPTIONS)

  await app.register(healthModule)
  await app.register(
    async (v1) => {
      // Every route registered inside this scope requires a valid access token.
      v1.addHook("onRequest", authenticate)

      await v1.register(meModule)
      await v1.register(eventModule)
    },
    { prefix: "/v1" },
  )

  return app
}
