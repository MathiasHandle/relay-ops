import { createPublicKey } from "node:crypto"
import { readFile } from "node:fs/promises"
import { calculateJwkThumbprint, exportJWK, importPKCS8 } from "jose"

import type { CryptoKey, JWK } from "jose"

export type SigningKey = {
  privateKey: CryptoKey
  publicJWK: JWK
  kid: string
}

export async function loadSigningKey(path: string): Promise<SigningKey> {
  const pem = await readFile(path, {
    encoding: "utf8",
  })
  const privateKey = await importPKCS8(pem, "EdDSA")
  const publicJWK = await exportJWK(createPublicKey(pem))
  const kid = await calculateJwkThumbprint(publicJWK)

  return {
    privateKey,
    publicJWK,
    kid,
  }
}
