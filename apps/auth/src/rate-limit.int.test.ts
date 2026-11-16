import { afterAll, beforeAll, expect, it } from "vitest"
import { buildApp } from "@/app"
import { oauthErrorResponseSchema } from "@/modules/oauth/oauth.errors"

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp({ logger: false })
})

afterAll(async () => {
  await app.close()
})

it("limits unknown routes independently of the global limit", async () => {
  for (let i = 0; i < 10; i++) {
    const response = await app.inject({ method: "GET", url: `/missing-${i}` })
    expect(response.statusCode).toBe(404)
  }

  const unknownResponse = await app.inject({ method: "GET", url: "/missing" })
  expect(unknownResponse.statusCode).toBe(429)
  expect(unknownResponse.headers["x-ratelimit-limit"]).toBe("10")
  expect(Number(unknownResponse.headers["retry-after"])).toBeGreaterThan(0)

  for (let i = 0; i < 60; i++) {
    const response = await app.inject({ method: "POST", url: "/oauth/token" })
    expect(response.statusCode).not.toBe(429)
  }

  const tokenResponse = await app.inject({
    method: "POST",
    url: "/oauth/token",
  })
  expect(tokenResponse.statusCode).toBe(429)
  expect(oauthErrorResponseSchema.parse(tokenResponse.json()).error).toBe(
    "invalid_request",
  )
  expect(tokenResponse.headers["x-ratelimit-limit"]).toBe("60")
  expect(tokenResponse.headers["x-ratelimit-remaining"]).toBe("0")
  expect(Number(tokenResponse.headers["x-ratelimit-reset"])).toBeGreaterThan(0)
  expect(Number(tokenResponse.headers["retry-after"])).toBeGreaterThan(0)
})
