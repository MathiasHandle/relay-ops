import { OAuthError } from "@node-oauth/oauth2-server"
import z from "zod"
import { OAUTH_ERROR_CODES } from "./oauth.errors"

import type { FastifyError, FastifyReply, FastifyRequest } from "fastify"

/**
 * Error handler for the OAuth plugin; responses follow RFC 6749 §5.2.
 */
export const oauthErrorHandler = (
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
) => {
  // 5xx - global handler takes care of it and hides internal details
  const isClientError =
    error.statusCode !== undefined &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  if (!isClientError) throw error

  // OAuthError from oauth2-server
  if (error instanceof OAuthError && error.code < 500) {
    const code = z.enum(OAUTH_ERROR_CODES).safeParse(error.name)

    if (code.success) {
      // RFC 6749 §5.2 allows only 400 or 401
      const status = error.code === 401 ? 401 : 400

      // 401 means the client authenticated via HTTP Basic; RFC 6749 §5.2 requires
      // the matching challenge header.
      if (status === 401) {
        reply.header("www-authenticate", 'Basic realm="Service"')
      }

      return reply.code(status).send({
        error: code.data,
        error_description: error.message,
      })
    }
  }

  // Remaining client errors: Fastify errors before the route (content type, body
  // parsing, schema validation) and OAuth codes outside RFC 6749 §5.2.
  return reply.code(400).send({
    error: "invalid_request",
    error_description: error.message,
  })
}
