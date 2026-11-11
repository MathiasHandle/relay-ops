import { randomBytes, randomUUID } from "node:crypto"
import argon2 from "argon2"
import { CLIENT_SCOPES } from "@relay-ops/contracts"
import { prisma } from "@/shared/db/prisma"

import type { ClientScope } from "@relay-ops/contracts"

type TestClientOptions = {
  allowedScopes?: ClientScope[]
  enabled?: boolean
}

export type TestClient = {
  // Internal id, the JWT `sub`.
  id: string
  clientId: string
  // Plain text, so tests can authenticate with it.
  secret: string
}

/**
 * Creates an OAuth client in the test database. Random `clientId` keeps tests
 * independent, so they never rely on the seed or on each other.
 */
export async function createTestClient({
  allowedScopes = [CLIENT_SCOPES.EVENTS_READ],
  enabled = true,
}: TestClientOptions = {}): Promise<TestClient> {
  const secret = randomBytes(24).toString("hex")

  const client = await prisma.oAuthClient.create({
    data: {
      name: "test-client",
      clientId: randomUUID(),
      secretHash: await argon2.hash(secret),
      allowedScopes,
      enabled,
    },
  })

  return { id: client.id, clientId: client.clientId, secret }
}
