import { randomUUID } from "node:crypto"
import { generateKeyPair, SignJWT } from "jose"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CLIENT_SCOPES } from "@relay-ops/contracts"
import { buildApp } from "@/app"
import { env } from "@/config/env"
import { meResponseBodySchema } from "@/modules/me/me.schemas"
import { createFakeDeliveryPublisher } from "@/test/delivery-publisher"
import { createTestTenant } from "@/test/factories"
import { bearer, signTestToken } from "@/test/tokens"
import { authErrorResponseSchema } from "./auth-error"

let app: Awaited<ReturnType<typeof buildApp>>
let tenant: Awaited<ReturnType<typeof createTestTenant>>

beforeAll(async () => {
  app = await buildApp({
    logger: false,
    deliveryPublisher: createFakeDeliveryPublisher().publisher,
  })
  tenant = await createTestTenant()
})

afterAll(async () => {
  await app.close()
})

function requestMe(authorization?: string) {
  return app.inject({
    method: "GET",
    url: "/v1/me",
    headers: authorization ? { authorization } : {},
  })
}

function signTenantToken(
  overrides: Omit<Parameters<typeof signTestToken>[0], "subject" | "scopes">,
) {
  return signTestToken({
    subject: tenant.identity.subject,
    scopes: [CLIENT_SCOPES.EVENTS_READ],
    ...overrides,
  })
}

function expectInvalidToken(res: Awaited<ReturnType<typeof requestMe>>) {
  expect(res.statusCode).toBe(401)
  expect(res.headers["www-authenticate"]).toBe('Bearer error="invalid_token"')
  expect(authErrorResponseSchema.parse(res.json()).error).toBe("invalid_token")
}

describe("authenticate", () => {
  it("accepts a valid token and resolves the organization", async () => {
    const token = await signTenantToken({})

    const res = await requestMe(bearer(token))

    expect(res.statusCode).toBe(200)
    expect(meResponseBodySchema.parse(res.json())).toEqual({
      organization: {
        id: tenant.organization.id,
        name: tenant.organization.name,
      },
      identity: { id: tenant.identity.id },
      scopes: [CLIENT_SCOPES.EVENTS_READ],
    })
  })

  describe("missing or malformed credentials", () => {
    it("rejects a request without a token with a bare Bearer challenge", async () => {
      const res = await requestMe()

      expect(res.statusCode).toBe(401)
      expect(res.headers["www-authenticate"]).toBe("Bearer")
      expect(authErrorResponseSchema.parse(res.json()).error).toBe(
        "invalid_request",
      )
    })

    it("rejects a non-Bearer scheme", async () => {
      const res = await requestMe("Basic dXNlcjpwYXNz")

      expect(res.statusCode).toBe(401)
      expect(res.headers["www-authenticate"]).toBe("Bearer")
      expect(authErrorResponseSchema.parse(res.json()).error).toBe(
        "invalid_request",
      )
    })

    it("rejects a Bearer scheme without a token", async () => {
      const res = await requestMe("Bearer")

      expect(res.statusCode).toBe(401)
      expect(authErrorResponseSchema.parse(res.json()).error).toBe(
        "invalid_request",
      )
    })
  })

  describe("invalid tokens", () => {
    it("rejects a token that is not a JWT", async () => {
      expectInvalidToken(await requestMe(bearer("not-a-jwt")))
    })

    it("rejects an expired token", async () => {
      const token = await signTenantToken({ expiresAt: "-1m" })

      expectInvalidToken(await requestMe(bearer(token)))
    })

    it("rejects a token from another issuer", async () => {
      // An identity exists for the foreign issuer, so only the `iss` check can
      // reject the token (not the OAuthIdentity lookup).
      const issuer = "http://other-issuer.test"
      const foreign = await createTestTenant({ issuer })
      const token = await signTestToken({
        subject: foreign.identity.subject,
        scopes: [CLIENT_SCOPES.EVENTS_READ],
        issuer,
      })

      expectInvalidToken(await requestMe(bearer(token)))
    })

    it("rejects a token for another audience", async () => {
      const token = await signTenantToken({ audience: "other-api" })

      expectInvalidToken(await requestMe(bearer(token)))
    })

    it("rejects a token that is not an access token (typ)", async () => {
      const token = await signTenantToken({ typ: "JWT" })

      expectInvalidToken(await requestMe(bearer(token)))
    })

    it("rejects a token signed with a key that is not published", async () => {
      const { privateKey } = await generateKeyPair("EdDSA")
      // Same `kid` as the published key, so only the signature check can reject it.
      const token = await signTenantToken({ privateKey })

      expectInvalidToken(await requestMe(bearer(token)))
    })

    it("rejects a token with a modified payload", async () => {
      const other = await createTestTenant()
      const token = await signTenantToken({})
      const [header, , signature] = token.split(".")
      const forgedPayload = Buffer.from(
        JSON.stringify({
          sub: other.identity.subject,
          client_id: randomUUID(),
          scope: CLIENT_SCOPES.EVENTS_WRITE,
          iss: env.JWT_ISSUER,
          aud: env.JWT_AUDIENCE,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ).toString("base64url")

      const res = await requestMe(
        bearer(`${header}.${forgedPayload}.${signature}`),
      )

      expectInvalidToken(res)
    })

    it("rejects a symmetric (HS256) token (algorithm confusion)", async () => {
      const token = await new SignJWT({
        client_id: randomUUID(),
        scope: CLIENT_SCOPES.EVENTS_READ,
      })
        .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
        .setSubject(tenant.identity.subject)
        .setIssuer(env.JWT_ISSUER)
        .setAudience(env.JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(new TextEncoder().encode("shared-secret-shared-secret-1234"))

      expectInvalidToken(await requestMe(bearer(token)))
    })

    it("rejects a token with an empty scope claim", async () => {
      const token = await signTestToken({
        subject: tenant.identity.subject,
        scopes: [],
      })

      expectInvalidToken(await requestMe(bearer(token)))
    })
  })

  describe("unknown or disabled clients", () => {
    it("rejects a valid token whose subject has no OAuthIdentity", async () => {
      const token = await signTestToken({
        subject: "unknown-subject",
        scopes: [CLIENT_SCOPES.EVENTS_READ],
      })

      expectInvalidToken(await requestMe(bearer(token)))
    })

    it("rejects a valid token of a disabled OAuthIdentity", async () => {
      const disabled = await createTestTenant({ identityEnabled: false })
      const token = await signTestToken({
        subject: disabled.identity.subject,
        scopes: [CLIENT_SCOPES.EVENTS_READ],
      })

      expectInvalidToken(await requestMe(bearer(token)))
    })
  })
})
