import { sendAuthError } from "./auth-error"

import type { ClientScope } from "@relay-ops/contracts"
import type { FastifyReply, FastifyRequest } from "fastify"

type FindMissingScopesOptions = {
  granted: string[]
  required: ClientScope[]
}

export function findMissingScopes(options: FindMissingScopesOptions) {
  const { granted, required } = options
  const grantedSet = new Set(granted)

  return required.filter((scope) => !grantedSet.has(scope))
}

/**
 * Creates a route-level `onRequest` hook that rejects tokens without all of the
 * required scopes. Must run after `authenticate`, which sets `request.principal`.
 */
export function requireScopes(required: ClientScope[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.principal) {
      throw new Error("requireScopes used on a route without authenticate")
    }

    const missing = findMissingScopes({
      granted: request.principal.scopes,
      required,
    })
    if (missing.length === 0) {
      return
    }

    request.log.info(
      { oauthIdentityId: request.principal.oauthIdentityId, missing },
      "insufficient scope",
    )

    return sendAuthError({
      reply,
      error: "insufficient_scope",
      description: `Missing required scope: ${missing.join(" ")}`,
      scopes: required,
    })
  }
}
