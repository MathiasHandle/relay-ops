import { calculateJwkThumbprint } from "jose"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "@/app"
import { env } from "@/config/env"
import { jwksResponseSchema } from "./keys.schemas"
import { loadSigningKey } from "./keys.service"

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp({ logger: false })
})

afterAll(async () => {
  await app.close()
})

function requestJwks() {
  return app.inject({ method: "GET", url: "/.well-known/jwks.json" })
}

describe("GET /.well-known/jwks.json", () => {
  it("publishes the public part of the signing key", async () => {
    const signingKey = await loadSigningKey(env.JWT_PRIVATE_KEY_PATH)

    const res = await requestJwks()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      keys: [
        {
          kty: "OKP",
          crv: "Ed25519",
          x: signingKey.publicJWK.x,
          kid: signingKey.kid,
          alg: "EdDSA",
          use: "sig",
        },
      ],
    })
  })

  it("never exposes the private key", async () => {
    const res = await requestJwks()

    expect(res.body).not.toContain('"d"')
  })

  it("uses the RFC 7638 thumbprint as kid", async () => {
    const res = await requestJwks()
    const [jwk] = jwksResponseSchema.parse(res.json()).keys
    if (!jwk) throw new Error("JWKS has no keys")

    expect(jwk.kid).toBe(await calculateJwkThumbprint(jwk))
  })

  it("is cacheable by clients", async () => {
    const res = await requestJwks()

    expect(res.headers["cache-control"]).toBe("public, max-age=300")
  })
})
