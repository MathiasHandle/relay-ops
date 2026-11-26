import { eventErrorHandler } from "./event.error-handler"
import { eventRoutes } from "./event.routes"

import type { FastifyPluginAsync } from "fastify"

export const eventModule: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(eventErrorHandler)

  await fastify.register(eventRoutes)
}
