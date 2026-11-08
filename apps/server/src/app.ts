import cors from "@fastify/cors"
import Fastify from "fastify"
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod"
import { prisma } from "@relay-ops/app-db"
import { healthModule } from "@/modules/health"
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

  await app.register(healthModule)

  return app
}
