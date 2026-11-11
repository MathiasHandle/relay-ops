import { STATUS_CODES } from "node:http"
import { EVENT_ERROR_CODE, EventError } from "./event.errors"

import type { FastifyError, FastifyReply, FastifyRequest } from "fastify"
import type { EventErrorCode } from "./event.errors"

const STATUS_BY_CODE: Record<EventErrorCode, number> = {
  [EVENT_ERROR_CODE.DESTINATION_NOT_FOUND]: 422,
  [EVENT_ERROR_CODE.DESTINATION_MISSING]: 422,
  [EVENT_ERROR_CODE.DESTINATION_DISABLED]: 409,
  [EVENT_ERROR_CODE.EVENT_CONFLICT]: 409,
}

export const eventErrorHandler = (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  // not a custom error - send to global handler
  if (!(error instanceof EventError)) {
    throw error
  }

  request.log.info({ err: error }, error.message)

  const statusCode = STATUS_BY_CODE[error.code]

  return reply.code(statusCode).send({
    statusCode,
    error: STATUS_CODES[statusCode] ?? "Error",
    code: error.code,
    message: error.message,
  })
}
