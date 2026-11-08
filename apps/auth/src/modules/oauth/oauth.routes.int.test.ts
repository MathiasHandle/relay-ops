import { createLocalJWKSet, jwtVerify } from "jose"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "@/app"
import { env } from "@/config/env"
import { prisma } from "@/shared/db/prisma"
import { createTestClient } from "@/test/create-test-client"
import { basicAuth, FORM_CONTENT_TYPE, formBody } from "@/test/http"
import { oauthErrorResponseSchema } from "./oauth.errors"
import { ACCESS_TOKEN_LIFETIME_SECONDS } from "./oauth.model"
import { tokenResponseSchema } from "./oauth.schemas"
import { CLIENT_SCOPES } from "./scopes"

import type { TestClient } from "@/test/create-test-client"

let app: Awaited<ReturnType<typeof buildApp>>
// Allowed scopes: events:read
let readClient: TestClient
// Allowed scopes: events:read, events:write
let readWriteClient: TestClient

beforeAll(async () => {
  app = await buildApp({ logger: false })
  readClient = await createTestClient()
  readWriteClient = await createTestClient({
    allowedScopes: [CLIENT_SCOPES.EVENTS_READ, CLIENT_SCOPES.EVENTS_WRITE],
  })
})

afterAll(async () => {
  await app.close()
})

type TokenRequest = {
  params: Record<string, string>
  // Sent as HTTP Basic; omit to send credentials in the body (or none).
  basic?: Pick<TestClient, "clientId" | "secret">
}

function requestToken({ params, basic }: TokenRequest) {
  return app.inject({
    method: "POST",
    url: "/oauth/token",
    headers: {
      "content-type": FORM_CONTENT_TYPE,
      ...(basic && { authorization: basicAuth(basic.clientId, basic.secret) }),
    },
    payload: formBody(params),
  })
}

const clientCredentials = (scope: string) => ({
  grant_type: "client_credentials",
  scope,
})

describe("POST /oauth/token: success", () => {
  it("issues a token with HTTP Basic credentials", async () => {
    const res = await requestToken({
      params: clientCredentials("events:read"),
      basic: readClient,
    })

    expect(res.statusCode).toBe(200)
    const body = tokenResponseSchema.parse(res.json())
    expect(body.token_type).toBe("Bearer")
    expect(body.scope).toBe("events:read")
    // oauth2-server floors the remaining seconds, so it may be 1 s less.
    expect(body.expires_in).toBeGreaterThanOrEqual(
      ACCESS_TOKEN_LIFETIME_SECONDS - 1,
    )
    expect(body.expires_in).toBeLessThanOrEqual(ACCESS_TOKEN_LIFETIME_SECONDS)
    // RFC 6749 §5.1: token responses must not be cached.
    expect(res.headers["cache-control"]).toBe("no-store")
    expect(res.headers["pragma"]).toBe("no-cache")
    expect(res.body).not.toContain(readClient.secret)
  })

  it("issues a token with credentials in the body", async () => {
    const res = await requestToken({
      params: {
        ...clientCredentials("events:read"),
        client_id: readClient.clientId,
        client_secret: readClient.secret,
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it("grants multiple allowed scopes", async () => {
    const res = await requestToken({
      params: clientCredentials("events:read events:write"),
      basic: readWriteClient,
    })

    expect(res.statusCode).toBe(200)
    expect(tokenResponseSchema.parse(res.json()).scope).toBe(
      "events:read events:write",
    )
  })

  it("issues a JWT verifiable with the published JWKS", async () => {
    const tokenRes = await requestToken({
      params: clientCredentials("events:read"),
      basic: readClient,
    })
    const { access_token } = tokenResponseSchema.parse(tokenRes.json())
    const jwksRes = await app.inject({
      method: "GET",
      url: "/.well-known/jwks.json",
    })

    // Same checks apps/server will do.
    const { payload, protectedHeader } = await jwtVerify(
      access_token,
      createLocalJWKSet(jwksRes.json()),
      {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithms: ["EdDSA"],
        typ: "at+jwt",
      },
    )

    expect(protectedHeader.kid).toBeTypeOf("string")
    expect(payload.sub).toBe(readClient.id)
    expect(payload["client_id"]).toBe(readClient.clientId)
    expect(payload["scope"]).toBe("events:read")
    expect(payload.jti).toBeTypeOf("string")
    expect(payload.iat).toBeTypeOf("number")
    expect(payload.exp).toBe((payload.iat ?? 0) + ACCESS_TOKEN_LIFETIME_SECONDS)
  })

  it("issues a unique jti for every token", async () => {
    const request = () =>
      requestToken({
        params: clientCredentials("events:read"),
        basic: readClient,
      })
    const [first, second] = await Promise.all([request(), request()])
    const jwksRes = await app.inject({
      method: "GET",
      url: "/.well-known/jwks.json",
    })
    const jwks = createLocalJWKSet(jwksRes.json())

    const jtis = await Promise.all(
      [first, second].map(async (res) => {
        const { access_token } = tokenResponseSchema.parse(res.json())
        const { payload } = await jwtVerify(access_token, jwks)
        return payload.jti
      }),
    )

    expect(jtis[0]).not.toBe(jtis[1])
  })
})

describe("POST /oauth/token: invalid_client", () => {
  it("returns 401 with WWW-Authenticate for a wrong secret via HTTP Basic", async () => {
    const res = await requestToken({
      params: clientCredentials("events:read"),
      basic: { clientId: readClient.clientId, secret: "wrong-secret" },
    })

    expect(res.statusCode).toBe(401)
    expect(res.headers["www-authenticate"]).toBe('Basic realm="Service"')
    expect(oauthErrorResponseSchema.parse(res.json()).error).toBe(
      "invalid_client",
    )
  })

  it("returns 400 without WWW-Authenticate for a wrong secret in the body", async () => {
    const res = await requestToken({
      params: {
        ...clientCredentials("events:read"),
        client_id: readClient.clientId,
        client_secret: "wrong-secret",
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.headers["www-authenticate"]).toBeUndefined()
    expect(oauthErrorResponseSchema.parse(res.json()).error).toBe(
      "invalid_client",
    )
  })

  it("rejects an unknown client", async () => {
    const res = await requestToken({
      params: clientCredentials("events:read"),
      basic: { clientId: "unknown-client", secret: "any-secret" },
    })

    expect(res.statusCode).toBe(401)
    expect(oauthErrorResponseSchema.parse(res.json()).error).toBe(
      "invalid_client",
    )
  })

  it("rejects a disabled client even with a valid secret", async () => {
    const disabledClient = await createTestClient({ enabled: false })

    const res = await requestToken({
      params: clientCredentials("events:read"),
      basic: disabledClient,
    })

    expect(res.statusCode).toBe(401)
    expect(oauthErrorResponseSchema.parse(res.json()).error).toBe(
      "invalid_client",
    )
  })

  it("rejects a request without client credentials", async () => {
    const res = await requestToken({ params: clientCredentials("events:read") })

    expect(res.statusCode).toBe(400)
    expect(oauthErrorResponseSchema.parse(res.json()).error).toBe(
      "invalid_client",
    )
  })
})

describe("POST /oauth/token: invalid_scope", () => {
  it.each([
    ["missing", undefined],
    ["not allowed for the client", "deliveries:retry"],
    ["partially not allowed", "events:read events:write"],
    ["unknown", "foo:bar"],
  ])("rejects a %s scope", async (_case, scope) => {
    const res = await requestToken({
      params: {
        grant_type: "client_credentials",
        ...(scope !== undefined && { scope }),
      },
      basic: readClient,
    })

    expect(res.statusCode).toBe(400)
    expect(oauthErrorResponseSchema.parse(res.json()).error).toBe(
      "invalid_scope",
    )
  })
})

describe("POST /oauth/token: grant_type", () => {
  it.each([
    ["missing", undefined, "invalid_request"],
    ["unsupported", "foo", "unsupported_grant_type"],
    ["not allowed for the client", "password", "unauthorized_client"],
  ])("rejects a %s grant_type", async (_case, grantType, expectedError) => {
    const res = await requestToken({
      params: {
        scope: "events:read",
        ...(grantType !== undefined && { grant_type: grantType }),
      },
      basic: readClient,
    })

    expect(res.statusCode).toBe(400)
    expect(oauthErrorResponseSchema.parse(res.json()).error).toBe(expectedError)
  })
})

describe("POST /oauth/token: invalid_request", () => {
  it.each([
    // Parsed by Fastify, rejected by oauth2-server.
    ["application/json", JSON.stringify(clientCredentials("events:read"))],
    ["text/plain", "grant_type=client_credentials"],
    // No Fastify parser: rejected by Fastify (415), mapped by the error handler.
    ["application/xml", "<grant_type>client_credentials</grant_type>"],
  ])("rejects a %s body", async (contentType, payload) => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      headers: {
        "content-type": contentType,
        authorization: basicAuth(readClient.clientId, readClient.secret),
      },
      payload,
    })

    expect(res.statusCode).toBe(400)
    expect(oauthErrorResponseSchema.parse(res.json()).error).toBe(
      "invalid_request",
    )
  })
})

describe("POST /oauth/token: server errors", () => {
  it("hides internal details when stored client data is invalid", async () => {
    const brokenClient = await createTestClient()
    await prisma.oAuthClient.update({
      where: { id: brokenClient.id },
      data: { allowedScopes: ["not-a-scope"] },
    })

    const res = await requestToken({
      params: clientCredentials("events:read"),
      basic: brokenClient,
    })

    // oauth2-server wraps non-OAuth errors in ServerError (503); the global
    // error handler sends only a generic message.
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({
      statusCode: 503,
      error: "Service Unavailable",
      message: "Service Unavailable",
    })
  })
})
