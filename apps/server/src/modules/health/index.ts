import type { FastifyPluginAsync } from "fastify"

export const healthModule: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/health",
    // this route is public, override swagger global bearerAuth requirement
    { schema: { tags: ["health"], security: [] } },
    async (_req, res) => {
      res.status(200).send({ status: "ok" })
    },
  )
}
