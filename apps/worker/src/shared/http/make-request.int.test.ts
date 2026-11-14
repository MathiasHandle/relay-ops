import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HttpRequestError } from "./http-request.errors"
import { makeRequest } from "./make-request"

import type { FastifyInstance } from "fastify"

let receiver: FastifyInstance
const logger = { error: vi.fn() }

beforeEach(() => {
  receiver = Fastify({ logger: false })
  logger.error.mockReset()
})

afterEach(async () => {
  await receiver.close()
})

describe("makeRequest over HTTP", () => {
  it("sends a real POST to a local destination", async () => {
    let received: unknown
    receiver.post("/hook", (request, reply) => {
      received = {
        method: request.method,
        deliveryId: request.headers["x-relayops-delivery-id"],
        body: request.body,
      }
      return reply.code(204).send()
    })
    const address = await receiver.listen({ host: "127.0.0.1", port: 0 })
    const body = {
      event: { name: "order.created" },
      delivery: { id: "delivery-1" },
    }

    const { response } = await makeRequest({
      url: `${address}/hook`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RelayOps-Delivery-Id": "delivery-1",
      },
      body: JSON.stringify(body),
      timeoutMs: 2_000,
      logger,
    })

    expect(response.status).toBe(204)
    expect(received).toEqual({ method: "POST", deliveryId: "delivery-1", body })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("rejects a redirect without sending a request to its target", async () => {
    const target = vi.fn(() => ({ ok: true }))
    receiver.post("/redirect", (_request, reply) => {
      return reply.code(307).header("location", "/target").send()
    })
    receiver.post("/target", target)
    const address = await receiver.listen({ host: "127.0.0.1", port: 0 })

    const request = makeRequest({
      url: `${address}/redirect`,
      method: "POST",
      timeoutMs: 2_000,
      logger,
    })

    await expect(request).rejects.toBeInstanceOf(HttpRequestError)
    await expect(request).rejects.toMatchObject({ reason: "request-failed" })
    expect(target).not.toHaveBeenCalled()
  })
})
