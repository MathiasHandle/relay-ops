import { randomUUID } from "node:crypto"
import { prisma } from "@relay-ops/app-db"
import { env } from "@/config/env"

type CreateTestTenantOptions = {
  identityEnabled?: boolean
  // `iss`, defaults to the trusted test issuer
  issuer?: string
}

/**
 * Creates an organization with one `OAuthIdentity`. Sign tokens for it with
 * `signTestToken({ subject: identity.subject, ... })`.
 */
export async function createTestTenant(options: CreateTestTenantOptions = {}) {
  const { identityEnabled = true, issuer = env.JWT_ISSUER } = options

  const organization = await prisma.organization.create({
    data: { name: `test-org-${randomUUID()}` },
  })

  const identity = await prisma.oAuthIdentity.create({
    data: {
      issuer,
      subject: randomUUID(),
      enabled: identityEnabled,
      organizationId: organization.id,
    },
  })

  return { organization, identity }
}

type CreateTestDestinationOptions = {
  organizationId: string
  enabled?: boolean
  // soft-deleted destinations are always disabled (DB check constraint)
  deleted?: boolean
}

export async function createTestDestination(
  options: CreateTestDestinationOptions,
) {
  const { organizationId, enabled = true, deleted = false } = options

  return prisma.destination.create({
    data: {
      organizationId,
      humanReadableId: `test-destination-${randomUUID()}`,
      url: "https://destination.test/hook",
      enabled: deleted ? false : enabled,
      deletedAt: deleted ? new Date() : null,
    },
  })
}
