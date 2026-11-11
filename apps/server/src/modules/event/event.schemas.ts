import z from "zod"
import { DELIVERY_STATUS } from "@relay-ops/contracts"

export const destinationSchema = z.object({
  humanReadableId: z.string().min(1),
})

const eventSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  payload: z.record(z.string(), z.json()),
})

export const createEventBodySchema = z.object({
  event: eventSchema,
  destinations: z
    .array(destinationSchema)
    .min(1)
    .refine(
      (destinations) => {
        const uniqueIds = new Set(destinations.map((d) => d.humanReadableId))
        return uniqueIds.size === destinations.length
      },
      { message: "Duplicate destinations are not allowed" },
    ),
})

export const createEventResponseSchema = z.object({
  event: z.object({
    id: z.string(),
    externalId: z.string(),
    name: z.string(),
    createdAt: z.iso.datetime(),
  }),

  deliveries: z.array(
    z.object({
      id: z.string(),
      status: z.enum(DELIVERY_STATUS),
      createdAt: z.iso.datetime(),
      destination: z.object({
        humanReadableId: z.string(),
      }),
    }),
  ),
})
