import { jwkSchema, jwksResponseSchema } from "./keys.schemas"

import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import type { KeysModuleOptions } from "."

export const keysRoutes: FastifyPluginAsyncZod<KeysModuleOptions> = async (
  fastify,
  { signingKey },
) => {
  const jwk = jwkSchema.parse({
    ...signingKey.publicJWK,
    kid: signingKey.kid,
    alg: "EdDSA",
    use: "sig",
  })
  const jwks = { keys: [jwk] }

  fastify.route({
    method: "GET",
    url: "/.well-known/jwks.json",
    schema: {
      response: {
        200: jwksResponseSchema,
      },
    },
    handler: async (_request, reply) => {
      return reply
        .status(200)
        .header("cache-control", "public, max-age=300")
        .send(jwks)
    },
  })
}
