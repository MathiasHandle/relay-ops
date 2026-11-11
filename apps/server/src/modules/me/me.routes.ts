import { meResponseBodySchema } from "./me.schemas"

import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"

export const meRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.route({
    method: "GET",
    url: "/me",
    schema: {
      tags: ["me"],
      response: {
        200: meResponseBodySchema,
      },
    },
    handler: async (request, reply) => {
      const { principal } = request

      return reply.status(200).send({
        organization: {
          id: principal.organizationId,
          name: principal.organizationName,
        },
        identity: {
          id: principal.oauthIdentityId,
        },
        scopes: principal.scopes,
      })
    },
  })
}
