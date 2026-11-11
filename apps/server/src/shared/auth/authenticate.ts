import { prisma } from "@relay-ops/app-db"
import { sendAuthError } from "./auth-error"
import { InvalidTokenError, verifyAccessToken } from "./token-verifier"

import type { FastifyReply, FastifyRequest } from "fastify"

/**
 * `onRequest` hook: verifies the Bearer access token, resolves the caller's
 * `OAuthIdentity` and sets `request.principal`.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const authHeader = request.headers.authorization
  if (!authHeader) {
    return sendAuthError({
      reply,
      error: "invalid_request",
      description: "Missing access token",
    })
  }

  const [scheme, value] = authHeader.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !value) {
    return sendAuthError({
      reply,
      error: "invalid_request",
      description: "Authorization scheme must be Bearer",
    })
  }

  try {
    const token = await verifyAccessToken(value)

    const oAuthIdentity = await prisma.oAuthIdentity.findUnique({
      where: {
        issuer_subject: { issuer: token.iss, subject: token.sub },
      },
      select: {
        id: true,
        enabled: true,
        organization: {
          select: { id: true, name: true },
        },
      },
    })

    // Valid token, but the client is not linked to an organization or is disabled.
    if (!oAuthIdentity || !oAuthIdentity.enabled) {
      return sendAuthError({
        reply,
        error: "invalid_token",
        description: "Unknown or disabled client",
      })
    }

    request.principal = {
      oauthIdentityId: oAuthIdentity.id,
      organizationId: oAuthIdentity.organization.id,
      organizationName: oAuthIdentity.organization.name,
      scopes: token.scope,
    }
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      return sendAuthError({
        reply,
        error: "invalid_token",
        description: err.message,
      })
    }

    // other errors -> 5xx
    throw err
  }
}
