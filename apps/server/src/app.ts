import cors from "@fastify/cors"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import Fastify from "fastify"
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod"
import { prisma } from "@relay-ops/app-db"
import { healthModule } from "@/modules/health"
import { meModule } from "@/modules/me"
import { authenticate } from "@/shared/auth/authenticate"
import { errorHandler, notFoundHandler } from "@/shared/errors/error-handler"
import { SWAGGER_OPTIONS, SWAGGER_UI_OPTIONS } from "@/shared/swagger"

type BuildAppOptions = {
  // disabled in tests
  logger: boolean
}

export const buildApp = async ({ logger }: BuildAppOptions) => {
  const app = Fastify({ logger })

  // Validate and serialize route schemas with Zod.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Default error/404 handlers for all routes. Set before plugins so they inherit
  // them; plugins may override the error handler with their own.
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  // Browser-based API clients for manual testing.
  await app.register(cors, {
    origin: ["https://hoppscotch.io"],
  })

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
    },
    { prefix: "/v1" },
  )

  return app
}
