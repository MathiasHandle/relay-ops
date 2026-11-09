import { prisma } from "../../src/client"

import type { Prisma } from "../../src/generated/prisma/client"

// Must match JWT_ISSUER of apps/auth in local dev (`iss` claim).
const DEV_ISSUER = "http://localhost:3002"

// Must match `OAuthClient.id` in the apps/auth seed (`sub` claim).
const AUTH_CLIENT_IDS = {
  acme: "vkecyh9v4rev5devm2yqn0fi",
  globex: "eqdktbzbpgwjigp3pbe7uuk4",
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
]

async function seed() {
  await prisma.organization.createMany({ data: organizations })
  await prisma.oAuthIdentity.createMany({ data: oauthIdentities })
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
