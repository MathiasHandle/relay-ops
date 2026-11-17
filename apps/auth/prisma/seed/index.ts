import { CLIENT_SCOPES } from "@relay-ops/contracts"
import { prisma } from "@/shared/db/prisma"

import type { Prisma } from "../.generated/client"

const oAuthClients: (Prisma.OAuthClientCreateInput & { id: string })[] = [
  {
    id: "vkecyh9v4rev5devm2yqn0fi",
    name: "acme-app",
    allowedScopes: [CLIENT_SCOPES.EVENTS_READ, CLIENT_SCOPES.EVENTS_WRITE],
    clientId: "aprhb1k1lb20qqefrt8qp8it",
    // 123456
    secretHash:
      "$argon2id$v=19$m=65536,t=3,p=4$q8XZ2ZrCj82RTNReZ86Ndg$ljHGXBdD2IQfD9nxLXK5e/3SI8Iuvp1EhTSp8X9ZOFs",
    createdAt: "2026-11-07T08:23:41.000Z",
    updatedAt: "2026-11-07T08:23:41.000Z",
  },
  {
    id: "eqdktbzbpgwjigp3pbe7uuk4",
    name: "globex-app",
    allowedScopes: [CLIENT_SCOPES.EVENTS_READ, CLIENT_SCOPES.EVENTS_WRITE],
    clientId: "aelmy9nr1rab64svugkg6bp3",
    // 123456
    secretHash:
      "$argon2id$v=19$m=65536,t=3,p=4$NUUD/VtiO796ZPw0zu8naQ$auOaZj6hEyOjrutOVhDCMuocYodjTIsxDNqJrEwnxf0",
    createdAt: "2026-11-07T13:57:09.000Z",
    updatedAt: "2026-11-07T13:57:09.000Z",
  },
  {
    // Read-only client  acme-app (scope tests)
    id: "jp8b492opkpntu1s1ldp9e6k",
    name: "acme-reader",
    allowedScopes: [CLIENT_SCOPES.EVENTS_READ],
    clientId: "o5ilo5u6qtfs9o7jq26j26f7",
    // 123456
    secretHash:
      "$argon2id$v=19$m=65536,t=3,p=4$U3DQMTHxU78ylW+7F+OMIg$8kxEV69YpugML99DxZN3vHjTuH2EcXwpJs3qNHM7Saw",
    createdAt: "2026-11-11T09:00:00.000Z",
    updatedAt: "2026-11-11T09:00:00.000Z",
  },
]

async function seed() {
  for (const client of oAuthClients) {
    await prisma.oAuthClient.upsert({
      where: { id: client.id },
      create: client,
      update: {},
    })
  }
}

async function seedDatabase() {
  try {
    await prisma.$connect()
    await seed()
  } finally {
    await prisma.$disconnect()
  }
}

seedDatabase()
