import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@relay-ops/app-db"
import { CLIENT_SCOPES, DELIVERY_STATUS } from "@relay-ops/contracts"
import { buildApp } from "@/app"
import { authErrorResponseSchema } from "@/shared/auth/auth-error"
import { domainErrorResponseSchema } from "@/shared/errors/error-response"
import { createTestDestination, createTestTenant } from "@/test/factories"
import { bearer, signTestToken } from "@/test/tokens"
import { EVENT_ERROR_CODE } from "./event.errors"
import { createEventResponseSchema } from "./event.schemas"

import type { ClientScope } from "@relay-ops/contracts"

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp({ logger: false })
})

afterAll(async () => {
  await app.close()
})

type SetupWriterOptions = {
  scopes?: ClientScope[]
}

// Fresh organization per test: row counts below are scoped to it.
async function setupWriter(options: SetupWriterOptions = {}) {
  const { scopes = [CLIENT_SCOPES.EVENTS_WRITE] } = options

  const tenant = await createTestTenant()
  const token = await signTestToken({
    subject: tenant.identity.subject,
    scopes,
  })

  return { organizationId: tenant.organization.id, token }
}

type EventBodyOptions = {
  destinations: string[]
  externalId?: string
  name?: string
  payload?: Record<string, unknown>
}

function eventBody(options: EventBodyOptions) {
  const {
    destinations,
    externalId = randomUUID(),
    name = "order.created",
    payload = { orderId: 42, items: [{ sku: "A-1", qty: 2 }] },
  } = options

  return {
    event: { externalId, name, payload },
    destinations: destinations.map((humanReadableId) => ({ humanReadableId })),
  }
}

type PostEventOptions = {
  token: string
  // `unknown` so validation tests can send malformed bodies
  body: unknown
}

function postEvent(options: PostEventOptions) {
  const { token, body } = options

  return app.inject({
    method: "POST",
    url: "/v1/events",
    headers: {
      authorization: bearer(token),
      "content-type": "application/json",
    },
    payload: JSON.stringify(body),
  })
}

async function countRows(organizationId: string) {
  const [events, deliveries] = await Promise.all([
    prisma.event.count({ where: { organizationId } }),
    prisma.delivery.count({ where: { organizationId } }),
  ])

  return { events, deliveries }
}

describe("POST /v1/events", () => {
  describe("authorization", () => {
    it("rejects a token without events:write", async () => {
      const { organizationId, token } = await setupWriter({
        scopes: [CLIENT_SCOPES.EVENTS_READ],
      })
      const destination = await createTestDestination({ organizationId })

      const res = await postEvent({
        token,
        body: eventBody({ destinations: [destination.humanReadableId] }),
      })

      expect(res.statusCode).toBe(403)
      expect(res.headers["www-authenticate"]).toBe(
        `Bearer error="insufficient_scope", scope="${CLIENT_SCOPES.EVENTS_WRITE}"`,
      )
      expect(authErrorResponseSchema.parse(res.json()).error).toBe(
        "insufficient_scope",
      )
      expect(await countRows(organizationId)).toEqual({
        events: 0,
        deliveries: 0,
      })
    })

    it("rejects a request without a token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/events",
        payload: eventBody({ destinations: ["any"] }),
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe("new event", () => {
    it("creates the event with one pending delivery per destination", async () => {
      const { organizationId, token } = await setupWriter()
      const first = await createTestDestination({ organizationId })
      const second = await createTestDestination({ organizationId })
      const body = eventBody({
        destinations: [first.humanReadableId, second.humanReadableId],
      })

      const res = await postEvent({ token, body })
      expect(res.statusCode).toBe(201)

      // raw json on purpose, so an extra field fails the test
      const json: unknown = res.json()
      const created = createEventResponseSchema.parse(json)

      expect(created.deliveries).toHaveLength(2)
      expect(json).toEqual({
        event: {
          id: expect.any(String),
          externalId: body.event.externalId,
          name: body.event.name,
          createdAt: expect.any(String),
        },
        // arrayContaining ignores order of items
        deliveries: expect.arrayContaining(
          [first, second].map((destination) => ({
            id: expect.any(String),
            status: DELIVERY_STATUS.PENDING,
            createdAt: expect.any(String),
            destination: { humanReadableId: destination.humanReadableId },
          })),
        ),
      })

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: created.event.id },
        include: { delivery: true },
      })
      expect(stored.organizationId).toBe(organizationId)
      expect(stored.payload).toEqual(body.event.payload)
      expect(stored.delivery.map((d) => d.id).sort()).toEqual(
        created.deliveries.map((d) => d.id).sort(),
      )
      expect(await countRows(organizationId)).toEqual({
        events: 1,
        deliveries: 2,
      })
    })
  })

  describe("idempotent retry", () => {
    it("returns 200 with the original event and creates nothing", async () => {
      const { organizationId, token } = await setupWriter()
      const firstDestination = await createTestDestination({ organizationId })
      const secondDestination = await createTestDestination({ organizationId })
      const body = eventBody({
        destinations: [
          firstDestination.humanReadableId,
          secondDestination.humanReadableId,
        ],
      })

      const first = await postEvent({ token, body })
      const retry = await postEvent({ token, body })
      expect(first.statusCode).toBe(201)
      expect(retry.statusCode).toBe(200)

      const firstBody = createEventResponseSchema.parse(first.json())
      // raw json on purpose, so an extra field fails the test
      const retryBody: unknown = retry.json()

      expect(retryBody).toEqual({
        event: firstBody.event,
        // arrayContaining ignores order of items
        deliveries: expect.arrayContaining(firstBody.deliveries),
      })

      // arrayContaining doesn't check array length
      expect(
        createEventResponseSchema.parse(retryBody).deliveries,
      ).toHaveLength(firstBody.deliveries.length)

      expect(await countRows(organizationId)).toEqual({
        events: 1,
        deliveries: 2,
      })
    })

    it("treats destinations in a different order as the same event", async () => {
      const { organizationId, token } = await setupWriter()
      const firstDestination = await createTestDestination({ organizationId })
      const secondDestination = await createTestDestination({ organizationId })
      const externalId = randomUUID()

      const first = await postEvent({
        token,
        body: eventBody({
          externalId,
          destinations: [
            firstDestination.humanReadableId,
            secondDestination.humanReadableId,
          ],
        }),
      })
      const retry = await postEvent({
        token,
        body: eventBody({
          externalId,
          destinations: [
            secondDestination.humanReadableId,
            firstDestination.humanReadableId,
          ],
        }),
      })

      expect(first.statusCode).toBe(201)
      expect(retry.statusCode).toBe(200)
      expect(createEventResponseSchema.parse(retry.json()).event.id).toBe(
        createEventResponseSchema.parse(first.json()).event.id,
      )
    })

    // PostgreSQL jsonb reorders object keys when storing (shorter keys first), so the
    // stored payload can come back in a different key order than the request and the
    // comparison with a retried payload must ignore it (also in nested objects, see
    // the next test).
    it("treats payload keys in a different order as the same event", async () => {
      const { organizationId, token } = await setupWriter()
      const destination = await createTestDestination({ organizationId })
      const externalId = randomUUID()
      const destinations = [destination.humanReadableId]

      const first = await postEvent({
        token,
        body: eventBody({ externalId, destinations, payload: { a: 1, b: 2 } }),
      })
      const retry = await postEvent({
        token,
        body: eventBody({ externalId, destinations, payload: { b: 2, a: 1 } }),
      })

      expect(first.statusCode).toBe(201)
      expect(retry.statusCode).toBe(200)
    })

    it("treats nested payload keys in a different order as the same event", async () => {
      const { organizationId, token } = await setupWriter()
      const destination = await createTestDestination({ organizationId })
      const externalId = randomUUID()
      const destinations = [destination.humanReadableId]

      const first = await postEvent({
        token,
        body: eventBody({
          externalId,
          destinations,
          payload: {
            order: { id: 1, customer: { name: "Ada", vip: true } },
            items: [{ sku: "A-1", qty: 2 }],
          },
        }),
      })
      const retry = await postEvent({
        token,
        body: eventBody({
          externalId,
          destinations,
          payload: {
            items: [{ qty: 2, sku: "A-1" }],
            order: { customer: { vip: true, name: "Ada" }, id: 1 },
          },
        }),
      })

      expect(first.statusCode).toBe(201)
      expect(retry.statusCode).toBe(200)
    })
  })

  describe("conflict on the same externalId", () => {
    const cases = [
      { change: "name", overrides: { name: "order.cancelled" } },
      { change: "payload", overrides: { payload: { orderId: 43 } } },
    ] as const

    for (const { change, overrides } of cases) {
      it(`returns 409 EVENT_CONFLICT for a different ${change}`, async () => {
        const { organizationId, token } = await setupWriter()
        const destination = await createTestDestination({ organizationId })
        const externalId = randomUUID()
        const destinations = [destination.humanReadableId]

        await postEvent({
          token,
          body: eventBody({ externalId, destinations }),
        })
        const res = await postEvent({
          token,
          body: eventBody({ externalId, destinations, ...overrides }),
        })

        expect(res.statusCode).toBe(409)
        expect(domainErrorResponseSchema.parse(res.json()).code).toBe(
          EVENT_ERROR_CODE.EVENT_CONFLICT,
        )
        expect(await countRows(organizationId)).toEqual({
          events: 1,
          deliveries: 1,
        })
      })
    }

    it("returns 409 EVENT_CONFLICT for payload array items in a different order", async () => {
      const { organizationId, token } = await setupWriter()
      const destination = await createTestDestination({ organizationId })
      const externalId = randomUUID()
      const destinations = [destination.humanReadableId]

      const first = await postEvent({
        token,
        body: eventBody({
          externalId,
          destinations,
          payload: { tags: ["a", "b"] },
        }),
      })
      const retry = await postEvent({
        token,
        body: eventBody({
          externalId,
          destinations,
          payload: { tags: ["b", "a"] },
        }),
      })

      expect(first.statusCode).toBe(201)
      expect(retry.statusCode).toBe(409)
      expect(domainErrorResponseSchema.parse(retry.json()).code).toBe(
        EVENT_ERROR_CODE.EVENT_CONFLICT,
      )
      expect(await countRows(organizationId)).toEqual({
        events: 1,
        deliveries: 1,
      })
    })

    it("returns 409 EVENT_CONFLICT for a different set of destinations", async () => {
      const { organizationId, token } = await setupWriter()
      const first = await createTestDestination({ organizationId })
      const second = await createTestDestination({ organizationId })
      const externalId = randomUUID()

      await postEvent({
        token,
        body: eventBody({ externalId, destinations: [first.humanReadableId] }),
      })
      const res = await postEvent({
        token,
        body: eventBody({
          externalId,
          destinations: [first.humanReadableId, second.humanReadableId],
        }),
      })

      expect(res.statusCode).toBe(409)
      expect(domainErrorResponseSchema.parse(res.json()).code).toBe(
        EVENT_ERROR_CODE.EVENT_CONFLICT,
      )
      expect(await countRows(organizationId)).toEqual({
        events: 1,
        deliveries: 1,
      })
    })
  })

  describe("destination checks", () => {
    it("returns 422 DESTINATION_NOT_FOUND for an unknown destination", async () => {
      const { organizationId, token } = await setupWriter()
      const known = await createTestDestination({ organizationId })

      const res = await postEvent({
        token,
        body: eventBody({
          destinations: [known.humanReadableId, "does-not-exist"],
        }),
      })

      expect(res.statusCode).toBe(422)
      const error = domainErrorResponseSchema.parse(res.json())
      expect(error.code).toBe(EVENT_ERROR_CODE.DESTINATION_NOT_FOUND)
      expect(error.message).toContain("does-not-exist")
      expect(error.message).not.toContain(known.humanReadableId)
      expect(await countRows(organizationId)).toEqual({
        events: 0,
        deliveries: 0,
      })
    })

    it("returns 422 DESTINATION_NOT_FOUND for a deleted destination", async () => {
      const { organizationId, token } = await setupWriter()
      const deleted = await createTestDestination({
        organizationId,
        deleted: true,
      })

      const res = await postEvent({
        token,
        body: eventBody({ destinations: [deleted.humanReadableId] }),
      })

      expect(res.statusCode).toBe(422)
      expect(domainErrorResponseSchema.parse(res.json()).code).toBe(
        EVENT_ERROR_CODE.DESTINATION_NOT_FOUND,
      )
      expect(await countRows(organizationId)).toEqual({
        events: 0,
        deliveries: 0,
      })
    })

    it("returns 409 DESTINATION_DISABLED for a disabled destination", async () => {
      const { organizationId, token } = await setupWriter()
      const enabled = await createTestDestination({ organizationId })
      const disabled = await createTestDestination({
        organizationId,
        enabled: false,
      })

      const res = await postEvent({
        token,
        body: eventBody({
          destinations: [enabled.humanReadableId, disabled.humanReadableId],
        }),
      })

      expect(res.statusCode).toBe(409)
      expect(domainErrorResponseSchema.parse(res.json()).code).toBe(
        EVENT_ERROR_CODE.DESTINATION_DISABLED,
      )
      expect(await countRows(organizationId)).toEqual({
        events: 0,
        deliveries: 0,
      })
    })
  })

  describe("tenant isolation", () => {
    it("does not let an organization use a destination of another organization", async () => {
      const acme = await setupWriter()
      const globex = await setupWriter()
      const acmeDestination = await createTestDestination({
        organizationId: acme.organizationId,
      })

      const res = await postEvent({
        token: globex.token,
        body: eventBody({ destinations: [acmeDestination.humanReadableId] }),
      })

      expect(res.statusCode).toBe(422)
      expect(domainErrorResponseSchema.parse(res.json()).code).toBe(
        EVENT_ERROR_CODE.DESTINATION_NOT_FOUND,
      )
      expect(await countRows(globex.organizationId)).toEqual({
        events: 0,
        deliveries: 0,
      })
      expect(await countRows(acme.organizationId)).toEqual({
        events: 0,
        deliveries: 0,
      })
    })

    it("scopes externalId per organization", async () => {
      const acme = await setupWriter()
      const globex = await setupWriter()
      const acmeDestination = await createTestDestination({
        organizationId: acme.organizationId,
      })
      const globexDestination = await createTestDestination({
        organizationId: globex.organizationId,
      })
      const externalId = randomUUID()

      const acmeRes = await postEvent({
        token: acme.token,
        body: eventBody({
          externalId,
          destinations: [acmeDestination.humanReadableId],
        }),
      })
      const globexRes = await postEvent({
        token: globex.token,
        body: eventBody({
          externalId,
          destinations: [globexDestination.humanReadableId],
        }),
      })

      expect(acmeRes.statusCode).toBe(201)
      expect(globexRes.statusCode).toBe(201)
      expect(
        createEventResponseSchema.parse(globexRes.json()).event.id,
      ).not.toBe(createEventResponseSchema.parse(acmeRes.json()).event.id)
    })
  })

  // Validation rules are covered by event.schemas.test.ts,
  // this test only checks that the schema is connected to the route and returns 400.
  describe("validation", () => {
    it("returns 400 for a body without event", async () => {
      const { organizationId, token } = await setupWriter()

      const res = await postEvent({
        token,
        body: { destinations: [{ humanReadableId: "d" }] },
      })

      expect(res.statusCode).toBe(400)
      expect(await countRows(organizationId)).toEqual({
        events: 0,
        deliveries: 0,
      })
    })
  })
})
