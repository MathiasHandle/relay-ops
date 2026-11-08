import OAuth2Server from "@node-oauth/oauth2-server"
import { z } from "zod"

import type { FastifyReply, FastifyRequest } from "fastify"

const querySchema = z.record(z.string(), z.unknown())

export function toOAuth2ServerRequest(
  request: FastifyRequest,
): OAuth2Server.Request {
  return new OAuth2Server.Request({
    headers: request.headers,
    method: request.method,
    query: querySchema.parse(request.query),
    body: request.body,
  })
}

export function sendOAuth2ServerResponse(
  response: OAuth2Server.Response,
  reply: FastifyReply,
): FastifyReply {
  return reply
    .code(response.status ?? 200)
    .headers(response.headers ?? {})
    .send(response.body)
}
