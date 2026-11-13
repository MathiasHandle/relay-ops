import { CLIENT_SCOPES } from "@relay-ops/contracts"
import { authErrorResponseSchema } from "@/shared/auth/auth-error"
import { requireScopes } from "@/shared/auth/require-scopes"
import { domainErrorResponseSchema } from "@/shared/errors/error-response"
import {
  createEventBodySchema,
  createEventResponseSchema,
} from "./event.schemas"
import { createEvent } from "./event.service"

import type { Delivery, Destination, Event } from "@relay-ops/app-db"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import type z from "zod"
import type { DeliveryPublisher } from "@/shared/queue/delivery-publisher"

export type EventRoutesOptions = {
  deliveryPublisher: DeliveryPublisher
}

type CreateEventResponse = z.infer<typeof createEventResponseSchema>

type MapCreateEventResponseParams = {
  event: Pick<Event, "id" | "externalId" | "name" | "createdAt">
  deliveries: (Pick<Delivery, "id" | "status" | "createdAt"> & {
    destination: Pick<Destination, "humanReadableId">
  })[]
}

function mapCreateEventResponse(
  params: MapCreateEventResponseParams,
): CreateEventResponse {
  const { event, deliveries } = params

  return {
    event: {
      id: event.id,
      externalId: event.externalId,
      name: event.name,
      createdAt: event.createdAt.toISOString(),
    },
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      status: delivery.status,
      createdAt: delivery.createdAt.toISOString(),
      destination: {
        humanReadableId: delivery.destination.humanReadableId,
      },
    })),
  }
}

export const eventRoutes: FastifyPluginAsyncZod<EventRoutesOptions> = async (
  fastify,
  options,
) => {
  const { deliveryPublisher } = options

  fastify.route({
    method: "POST",
    url: "/events",
    onRequest: requireScopes([CLIENT_SCOPES.EVENTS_WRITE]),
    schema: {
      tags: ["events"],
      body: createEventBodySchema,
      response: {
        200: createEventResponseSchema,
        201: createEventResponseSchema,
        401: authErrorResponseSchema,
        403: authErrorResponseSchema,
        409: domainErrorResponseSchema,
        422: domainErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const { organizationId } = request.principal

      const result = await createEvent({
        organizationId,
        requested: request.body,
        logger: request.log,
        deliveryPublisher,
      })

      return reply
        .status(result.kind === "created" ? 201 : 200)
        .send(mapCreateEventResponse(result))
    },
  })
}
