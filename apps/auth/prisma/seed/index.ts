import { CLIENT_SCOPES } from "@/modules/oauth/scopes"
import { prisma } from "@/shared/db/prisma"

import type { Prisma } from "../.generated/client"

const oAuthClients: Prisma.OAuthClientCreateManyInput[] = [
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
]

async function seed() {
  await prisma.oAuthClient.createMany({
    data: oAuthClients,
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

seedDatabase()
