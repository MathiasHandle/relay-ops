import { eventErrorHandler } from "./event.error-handler"
import { eventRoutes } from "./event.routes"

import type { FastifyPluginAsync } from "fastify"
import type { EventRoutesOptions } from "./event.routes"

export const eventModule: FastifyPluginAsync<EventRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.setErrorHandler(eventErrorHandler)

  await fastify.register(eventRoutes, options)
}
