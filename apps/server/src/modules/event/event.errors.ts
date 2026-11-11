export const EVENT_ERROR_CODE = {
  DESTINATION_NOT_FOUND: "DESTINATION_NOT_FOUND",
  DESTINATION_DISABLED: "DESTINATION_DISABLED",
  DESTINATION_MISSING: "DESTINATION_MISSING",
  EVENT_CONFLICT: "EVENT_CONFLICT",
} as const

export type EventErrorCode =
  (typeof EVENT_ERROR_CODE)[keyof typeof EVENT_ERROR_CODE]

export abstract class EventError extends Error {
  abstract readonly code: EventErrorCode

  constructor(message: string) {
    super(message)
    // name of the child subclass (e.g. "UnknownDestinationError")
    this.name = new.target.name
  }
}

export class UnknownDestinationError extends EventError {
  readonly code = EVENT_ERROR_CODE.DESTINATION_NOT_FOUND

  constructor(humanReadableIds: string[]) {
    super(`Unknown destinations: ${humanReadableIds.join(", ")}`)
  }
}

export class DisabledDestinationError extends EventError {
  readonly code = EVENT_ERROR_CODE.DESTINATION_DISABLED

  constructor(disabledHumanReadableIds: string[]) {
    super(`Disabled destinations: ${disabledHumanReadableIds.join(", ")}`)
  }
}

export class MissingDestinationError extends EventError {
  readonly code = EVENT_ERROR_CODE.DESTINATION_MISSING

  constructor() {
    super("At least one destination is required")
  }
}

export class EventConflictError extends EventError {
  readonly code = EVENT_ERROR_CODE.EVENT_CONFLICT
  readonly externalId: string

  constructor(externalId: string) {
    super(
      `Event with externalId ${externalId} already exists with different content`,
    )

    this.externalId = externalId
  }
}
