import { z } from "zod"
import { prisma } from "../../src/client"

import type { Prisma } from "../../src/generated/prisma/client"

// Must match JWT_ISSUER of apps/auth in local dev (`iss` claim).
const DEV_ISSUER = z
  .url()
  .default("http://localhost:3002")
  .parse(process.env["JWT_ISSUER"])

// Must match `OAuthClient.id` in the apps/auth seed (`sub` claim).
const AUTH_CLIENT_IDS = {
  acme: "vkecyh9v4rev5devm2yqn0fi",
  globex: "eqdktbzbpgwjigp3pbe7uuk4",
  acmeReader: "jp8b492opkpntu1s1ldp9e6k",
} as const

const organizations: Prisma.OrganizationCreateManyInput[] = [
  {
    id: "qxs4noubn2htag8cara4g2qo",
    name: "Acme",
    createdAt: "2026-11-09T09:00:00.000Z",
    updatedAt: "2026-11-09T09:00:00.000Z",
  },
  {
    id: "cqulf4v9n0uz6pwnnon7jyv1",
    name: "Globex",
    createdAt: "2026-11-09T09:00:00.000Z",
    updatedAt: "2026-11-09T09:00:00.000Z",
  },
]

const oauthIdentities: Prisma.OAuthIdentityCreateManyInput[] = [
  {
    issuer: DEV_ISSUER,
    subject: AUTH_CLIENT_IDS.acme,
    organizationId: "qxs4noubn2htag8cara4g2qo",
    createdAt: "2026-11-09T09:00:00.000Z",
    updatedAt: "2026-11-09T09:00:00.000Z",
  },
  {
    issuer: DEV_ISSUER,
    subject: AUTH_CLIENT_IDS.globex,
    organizationId: "cqulf4v9n0uz6pwnnon7jyv1",
    createdAt: "2026-11-09T09:00:00.000Z",
    updatedAt: "2026-11-09T09:00:00.000Z",
  },
  {
    issuer: DEV_ISSUER,
    subject: AUTH_CLIENT_IDS.acmeReader,
    organizationId: "qxs4noubn2htag8cara4g2qo",
    createdAt: "2026-11-11T09:00:00.000Z",
    updatedAt: "2026-11-11T09:00:00.000Z",
  },
]

const destinations: Prisma.DestinationCreateManyInput[] = [
  {
    id: "d1acmewebhooksite0000001",
    humanReadableId: "webhook-site",
    // replace with real url
    url: "https://webhook.site/00000000-0000-4000-8000-000000000001",
    organizationId: "qxs4noubn2htag8cara4g2qo",
    createdAt: "2026-11-11T09:00:00.000Z",
    updatedAt: "2026-11-11T09:00:00.000Z",
  },
  {
    // Disabled: POST /v1/events with it must be rejected.
    id: "d2acmedisabled0000000002",
    humanReadableId: "disabled-hook",
    url: "https://webhook.site/00000000-0000-4000-8000-000000000002",
    enabled: false,
    organizationId: "qxs4noubn2htag8cara4g2qo",
    createdAt: "2026-11-11T09:00:00.000Z",
    updatedAt: "2026-11-11T09:00:00.000Z",
  },
  {
    // Same humanReadableId as Acme's: tenant isolation tests.
    id: "d3globexwebhooksite00003",
    humanReadableId: "webhook-site",
    url: "https://webhook.site/00000000-0000-4000-8000-000000000003",
    organizationId: "cqulf4v9n0uz6pwnnon7jyv1",
    createdAt: "2026-11-11T09:00:00.000Z",
    updatedAt: "2026-11-11T09:00:00.000Z",
  },
]

async function seed() {
  await prisma.$transaction(async (tx) => {
    for (const organization of organizations) {
      const existing = await tx.organization.upsert({
        where: { id: organization.id },
        create: organization,
        update: {},
      })
      if (existing.name !== organization.name) {
        throw new Error(
          "Seed organization ID belongs to a different organization",
        )
      }
    }

    for (const identity of oauthIdentities) {
      const existing = await tx.oAuthIdentity.upsert({
        where: {
          issuer_subject: {
            issuer: identity.issuer,
            subject: identity.subject,
          },
        },
        create: identity,
        update: {},
      })
      if (existing.organizationId !== identity.organizationId) {
        throw new Error("Seed identity belongs to a different organization")
      }
    }

    for (const destination of destinations) {
      const existing = await tx.destination.upsert({
        where: { id: destination.id },
        create: destination,
        update: {},
      })
      if (existing.organizationId !== destination.organizationId) {
        throw new Error("Seed destination belongs to a different organization")
      }
    }
  })
}

async function seedDatabase() {
  try {
    await prisma.$connect()
    await seed()
  } finally {
    await prisma.$disconnect()
  }
}

await seedDatabase()
