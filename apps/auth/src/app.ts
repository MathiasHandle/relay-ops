import cors from "@fastify/cors"
import Fastify from "fastify"
import { healthModule } from "@/modules/health"
import { prisma } from "@/shared/db/prisma"
import { errorHandler, notFoundHandler } from "@/shared/errors/error-handler"

export const buildApp = async () => {
  const app = Fastify({ logger: true })

  // Default error/404 handlers for all routes. Set before plugins so they inherit
  // them; plugins may override the error handler with their own.
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  await app.register(cors, {
    origin: ["https://hoppscotch.io"],
  })

  app.addHook("onClose", async () => {
    await prisma.$disconnect()
  })

  await app.register(healthModule)

  return app
}
