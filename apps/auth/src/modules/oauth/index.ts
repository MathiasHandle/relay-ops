import { oauthErrorHandler } from "./oauth.error-handler"
import { oauthRoutes } from "./oauth.routes"

import type { FastifyPluginAsync } from "fastify"
import type { SigningKey } from "@/modules/keys"

export type OAuthModuleOptions = {
  signingKey: SigningKey
}

// OAuth module: the prefix is set by the caller (app.ts).
export const oauthModule: FastifyPluginAsync<OAuthModuleOptions> = async (
  fastify,
  { signingKey },
) => {
  // RFC 6749 §5.2 format - error responses for oAuth endpoints
  fastify.setErrorHandler(oauthErrorHandler)

  await fastify.register(oauthRoutes, { signingKey })
}
