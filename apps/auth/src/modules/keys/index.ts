import { keysRoutes } from "./keys.routes"

import type { FastifyPluginAsync } from "fastify"
import type { SigningKey } from "./keys.service"

export { loadSigningKey } from "./keys.service"
export type { SigningKey } from "./keys.service"

export type KeysModuleOptions = {
  signingKey: SigningKey
}

export const keysModule: FastifyPluginAsync<KeysModuleOptions> = async (
  fastify,
  { signingKey },
) => {
  await fastify.register(keysRoutes, { signingKey })
}
