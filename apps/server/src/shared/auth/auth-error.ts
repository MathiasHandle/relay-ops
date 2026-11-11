import z from "zod"

import type { ClientScope } from "@relay-ops/contracts"
import type { FastifyReply } from "fastify"

// RFC 6750 §3
export const authErrorResponseSchema = z.object({
  error: z.enum(["invalid_request", "invalid_token", "insufficient_scope"]),
  error_description: z.string(),
})

type AuthErrorCode = z.infer<typeof authErrorResponseSchema>["error"]

type SendAuthErrorOptions = {
  reply: FastifyReply
  error: AuthErrorCode
  description: string
  scopes?: ClientScope[]
}

// RFC 6750 §3.1: missing or unusable credentials get a bare "Bearer" challenge,
// a rejected token gets 401 with error="invalid_token", a token without the
// required scopes gets 403 with error="insufficient_scope" and scope="...".
export function sendAuthError(options: SendAuthErrorOptions) {
  const { reply, error, description, scopes } = options

  const status = error === "insufficient_scope" ? 403 : 401

  let challenge = "Bearer"
  if (error !== "invalid_request") {
    challenge += ` error="${error}"`
  }
  if (error === "insufficient_scope" && scopes) {
    challenge += `, scope="${scopes.join(" ")}"`
  }

  return reply
    .status(status)
    .header("www-authenticate", challenge)
    .send({ error, error_description: description })
}
