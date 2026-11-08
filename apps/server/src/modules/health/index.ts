import type { FastifyPluginAsync } from "fastify"

export const healthModule: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async (_req, res) => {
    res.status(200).send({ status: "ok" })
  })
}
