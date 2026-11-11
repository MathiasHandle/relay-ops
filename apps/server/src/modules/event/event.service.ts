import { isDeepStrictEqual } from "node:util"
import { prisma } from "@relay-ops/app-db"
import {
  DisabledDestinationError,
  EventConflictError,
  MissingDestinationError,
  UnknownDestinationError,
} from "./event.errors"

import type { Event, Prisma } from "@relay-ops/app-db"
import type { FastifyBaseLogger } from "fastify"
import type z from "zod"
import type { destinationSchema } from "./event.schemas"

type VerifyDestinationParams = {
  organizationId: string
  logger: FastifyBaseLogger
  destinations: z.infer<typeof destinationSchema>[]
}

async function verifyDestinations(params: VerifyDestinationParams) {
  const { organizationId, destinations } = params

  const dedupIds = [...new Set(destinations.map((d) => d.humanReadableId))]

  const existingDestinations = await prisma.destination.findMany({
    where: {
      organizationId,
      humanReadableId: { in: dedupIds },
      deletedAt: null,
    },
    select: {
      id: true,
      humanReadableId: true,
      enabled: true,
    },
  })

  // missing, deleted or owned by another organization.
  const foundIds = new Set(existingDestinations.map((d) => d.humanReadableId))
  const unknownIds = dedupIds.filter((id) => !foundIds.has(id))
  if (unknownIds.length > 0) {
    throw new UnknownDestinationError(unknownIds)
  }

  // check enabled status
  const disabledDestinations = existingDestinations.filter((d) => !d.enabled)
  if (disabledDestinations.length > 0) {
    throw new DisabledDestinationError(
      disabledDestinations.map((d) => d.humanReadableId),
    )
  }

  return existingDestinations
}

type FindExistingEventParams = {
  organizationId: string
  externalId: string
}

async function findExistingEvent(params: FindExistingEventParams) {
  const { organizationId, externalId } = params

  return prisma.event.findFirst({
    where: { organizationId, externalId },
    include: {
      delivery: {
        include: {
          destination: { select: { humanReadableId: true } },
        },
      },
    },
  })
}

type ExistingEvent = NonNullable<Awaited<ReturnType<typeof findExistingEvent>>>

type RequestedEvent = {
  event: {
    name: string
    payload: Prisma.InputJsonValue
  }
  destinations: { humanReadableId: string }[]
}

type IsSameEventParams = {
  existing: ExistingEvent
  body: RequestedEvent
}

function isSameEvent(params: IsSameEventParams) {
  const { existing, body } = params

  const existingDestinations = existing.delivery
    .map((d) => d.destination.humanReadableId)
    .sort()

  const requestedDestinations = body.destinations
    .map((d) => d.humanReadableId)
    .sort()

  return (
    existing.name === body.event.name &&
    isDeepStrictEqual(existing.payload, body.event.payload) &&
    isDeepStrictEqual(existingDestinations, requestedDestinations)
  )
}

type SaveEventParams = {
  event: {
    externalId: string
    payload: Prisma.InputJsonValue
    name: string
  }
  destinationIds: string[]
  organizationId: string
  logger: FastifyBaseLogger
}

async function saveEvent(params: SaveEventParams) {
  const { event, organizationId, destinationIds, logger } = params
  const logContext = {
    organizationId,
    eventExternalId: event.externalId,
  }
  logger.debug(logContext, "persisting event and deliveries")

  const result = await prisma.$transaction(async (tx) => {
    const createdEvent = await tx.event.create({
      data: {
        externalId: event.externalId,
        name: event.name,
        payload: event.payload,
        organizationId,
      },
    })

    const createdDeliveries = await tx.delivery.createManyAndReturn({
      data: destinationIds.map((destinationId) => ({
        organizationId,
        destinationId,
        eventId: createdEvent.id,
      })),
      include: {
        destination: { select: { humanReadableId: true } },
      },
    })

    return {
      createdEvent,
      createdDeliveries,
    }
  })

  logger.debug(
    { ...logContext, eventId: result.createdEvent.id },
    "event and deliveries successfully persisted",
  )

  return result
}

type CreateEventParams = {
  organizationId: string
  requested: RequestedEvent & { event: { externalId: string } }
  logger: FastifyBaseLogger
}

type CreateEventResult = {
  kind: "created" | "existing"
  event: Event
  deliveries: ExistingEvent["delivery"]
}

export async function createEvent(
  params: CreateEventParams,
): Promise<CreateEventResult> {
  const { organizationId, requested, logger } = params
  const { externalId } = requested.event

  if (requested.destinations.length === 0) {
    throw new MissingDestinationError()
  }

  const existing = await findExistingEvent({ organizationId, externalId })
  if (existing) {
    if (!isSameEvent({ existing, body: requested })) {
      throw new EventConflictError(externalId)
    }

    return { kind: "existing", event: existing, deliveries: existing.delivery }
  }

  const destinations = await verifyDestinations({
    organizationId,
    destinations: requested.destinations,
    logger,
  })

  const { createdEvent, createdDeliveries } = await saveEvent({
    event: requested.event,
    destinationIds: destinations.map((d) => d.id),
    organizationId,
    logger,
  })

  return {
    kind: "created",
    event: createdEvent,
    deliveries: createdDeliveries,
  }
}
