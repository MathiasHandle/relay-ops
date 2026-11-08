import { STATUS_CODES } from "node:http"

import type { FastifyError, FastifyReply, FastifyRequest } from "fastify"

// Default error handler for routes without their own error contract.
// Response shape: { statusCode, error, message } (same as Fastify's default).
export const errorHandler = (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  // Errors without a valid 4xx/5xx status (e.g. plain `throw new Error()`) are 500.
  const statusCode =
    error.statusCode !== undefined && error.statusCode >= 400
      ? error.statusCode
      : 500
  // If the status code is unknown, use a generic "Error" message.
  const reason = STATUS_CODES[statusCode] ?? "Error"

  // Server error: log the details, send a generic message so internals never leak.
  if (statusCode >= 500) {
    request.log.error({ err: error }, "Unhandled error")
    return reply
      .code(statusCode)
      .send({ statusCode, error: reason, message: reason })
  }

  // Client errors (4xx)
  request.log.info({ err: error }, error.message)
  return reply
    .code(statusCode)
    .send({ statusCode, error: reason, message: error.message })
}

// Unknown route (404); same response shape as errorHandler.
export const notFoundHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  return reply.code(404).send({
    statusCode: 404,
    error: STATUS_CODES[404],
    message: `Route ${request.method} ${request.url} not found`,
  })
}
