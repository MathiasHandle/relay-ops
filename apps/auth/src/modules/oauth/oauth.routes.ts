import OAuth2Server from "@node-oauth/oauth2-server"
import { env } from "@/config/env"
import {
  sendOAuth2ServerResponse,
  toOAuth2ServerRequest,
} from "./oauth.adapter"
import { oauthErrorResponseSchema } from "./oauth.errors"
import { ACCESS_TOKEN_LIFETIME_SECONDS, OAuth2Model } from "./oauth.model"
import { tokenResponseSchema } from "./oauth.schemas"
import { loadSigningKey } from "./oauth.service"

import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"

export const oauthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const signingKey = await loadSigningKey(env.JWT_PRIVATE_KEY_PATH)
  const model = new OAuth2Model(fastify.log, signingKey)

  const oauth2server = new OAuth2Server({
    model: model,
    accessTokenLifetime: ACCESS_TOKEN_LIFETIME_SECONDS,
  })

  fastify.route({
    method: "POST",
    url: "/token",
    schema: {
      response: {
        200: tokenResponseSchema,
        400: oauthErrorResponseSchema,
        401: oauthErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const oAuthRequest = toOAuth2ServerRequest(request)
      const oAuthResponse = new OAuth2Server.Response()

      await oauth2server.token(oAuthRequest, oAuthResponse)

      return sendOAuth2ServerResponse(oAuthResponse, reply)
    },
  })
}
