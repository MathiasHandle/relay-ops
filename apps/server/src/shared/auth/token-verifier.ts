import { createRemoteJWKSet, errors, jwtVerify } from "jose"
import z from "zod"
import { env } from "@/config/env"

import type { JWTPayload } from "jose"

const JWKS = createRemoteJWKSet(new URL(env.AUTH_JWKS_URL))

const tokenSchema = z.object({
  // apps/auth oauth_client.id
  sub: z.string().min(1),
  client_id: z.string().min(1),
  scope: z
    .string()
    .min(1)
    .transform((s) => s.split(" ")),
  iss: z.string().min(1),
})

export class InvalidTokenError extends Error {
  override name = "InvalidTokenError"
}

export async function verifyAccessToken(token: string) {
  let verifiedPayload: JWTPayload

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["EdDSA"],
      typ: "at+jwt",
      // sub (subject): oauth-client that asked for the token , exp: expiration, iat: issued at
      requiredClaims: ["sub", "exp", "iat"],
    })

    verifiedPayload = payload
  } catch (err: unknown) {
    // auth unreachable or broken JWKS: our problem -> 5xx
    if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid)
      throw err

    // every other jose error is a bad token -> 401
    if (err instanceof errors.JOSEError)
      throw new InvalidTokenError("Invalid access token", { cause: err })

    throw err
  }

  // valid signature, but claims do not have the expected shape
  const parsedPayload = tokenSchema.safeParse(verifiedPayload)
  if (!parsedPayload.success) {
    throw new InvalidTokenError("Invalid access token claims", {
      cause: parsedPayload.error,
    })
  }

  return parsedPayload.data
}
