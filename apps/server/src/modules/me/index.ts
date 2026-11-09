import { meRoutes } from "./me.routes"

import type { FastifyPluginAsync } from "fastify"

export const meModule: FastifyPluginAsync = async (fastify) => {
  await fastify.register(meRoutes)
}
