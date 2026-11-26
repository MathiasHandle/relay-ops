import { afterEach, beforeEach, expect, it } from "vitest"
import { CLIENT_SCOPES } from "@relay-ops/contracts"
import { buildApp } from "@/app"
import { createTestTenant } from "@/test/factories"
import { bearer, signTestToken } from "@/test/tokens"

let app: Awaited<ReturnType<typeof buildApp>>

beforeEach(async () => {
  app = await buildApp({
    logger: false,
  })
})

afterEach(async () => {
  await app.close()
})

it("limits unknown routes independently of the global limit", async () => {
  for (let i = 0; i < 10; i++) {
    const response = await app.inject({ method: "GET", url: `/missing-${i}` })
    expect(response.statusCode).toBe(404)
  }

  const unknown = await app.inject({ method: "GET", url: "/missing" })
  expect(unknown.statusCode).toBe(429)
  expect(unknown.headers["x-ratelimit-limit"]).toBe("10")
  expect(Number(unknown.headers["retry-after"])).toBeGreaterThan(0)

  for (let i = 0; i < 60; i++) {
    const response = await app.inject({ method: "GET", url: "/health" })
    expect(response.statusCode).toBe(200)
  }

  const health = await app.inject({ method: "GET", url: "/health" })
  expect(health.statusCode).toBe(429)
  expect(health.headers["x-ratelimit-limit"]).toBe("60")
  expect(health.headers["x-ratelimit-remaining"]).toBe("0")
  expect(Number(health.headers["x-ratelimit-reset"])).toBeGreaterThan(0)
  expect(Number(health.headers["retry-after"])).toBeGreaterThan(0)
})

it("rejects an event body exceeding 64 KiB", async () => {
  const tenant = await createTestTenant()
  const token = await signTestToken({
    subject: tenant.identity.subject,
    scopes: [CLIENT_SCOPES.EVENTS_WRITE],
  })

  const response = await app.inject({
    method: "POST",
    url: "/v1/events",
    headers: {
      authorization: bearer(token),
      "content-type": "application/json",
    },
    payload: JSON.stringify({ data: "x".repeat(64 * 1024) }),
  })

  expect(response.statusCode).toBe(413)
})
