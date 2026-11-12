import { randomUUID } from "node:crypto"
import { importJWK, SignJWT } from "jose"
import { inject } from "vitest"
import { env } from "@/config/env"

import type { ClientScope } from "@relay-ops/contracts"
import type { CryptoKey } from "jose"

type SignTestTokenOptions = {
  // `OAuthIdentity.subject` of the caller
  subject: string
  scopes: ClientScope[]
  issuer?: string
  audience?: string
  // jose time span or timestamp, e.g. "5m" or "-1m" (already expired)
  expiresAt?: string | number
  typ?: string
  // Sign with a key other than the published test key (default).
  privateKey?: CryptoKey
}

/**
 * Signs an access token shaped like the ones from apps/auth. By default it is valid
 * and verifies against the JWKS served by the global test setup; options override
 * single claims to produce invalid tokens.
 */
export async function signTestToken(options: SignTestTokenOptions) {
  const {
    subject,
    scopes,
    issuer = env.JWT_ISSUER,
    audience = env.JWT_AUDIENCE,
    expiresAt = "5m",
    typ = "at+jwt",
    privateKey,
  } = options

  const { privateJwk, kid } = inject("testSigningKey")
  const key = privateKey ?? (await importJWK(privateJwk, "EdDSA"))

  return new SignJWT({ client_id: randomUUID(), scope: scopes.join(" ") })
    .setProtectedHeader({ alg: "EdDSA", typ, kid })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key)
}

export function bearer(token: string) {
  return `Bearer ${token}`
}
