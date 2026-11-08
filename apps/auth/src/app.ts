import cors from "@fastify/cors"
import formbody from "@fastify/formbody"
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

export const buildApp = async () => {
  const app = Fastify({ logger: true })

  // Validate and serialize route schemas with Zod.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Default error/404 handlers for all routes. Set before plugins so they inherit
  // them; plugins may override the error handler with their own.
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  await app.register(cors, {
    origin: ["https://hoppscotch.io"],
  })

  // Parse application/x-www-form-urlencoded bodies (required by OAuth /token).
  await app.register(formbody)

  app.addHook("onClose", async () => {
    await prisma.$disconnect()
  })

  const signingKey = await loadSigningKey(env.JWT_PRIVATE_KEY_PATH)

  await app.register(healthModule)
  await app.register(keysModule, { signingKey })
  await app.register(oauthModule, { prefix: "/oauth", signingKey })

  return app
}
