import cors from "@fastify/cors"
import Fastify from "fastify"
import * as env from "./env.js"
import { prisma } from "./services/db/index.js"

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: ["https://hoppscotch.io"],
})

app.get("/health", async (req, res) => {
  res.status(200).send({ status: "ok" })
})

app.addHook("onClose", async () => {
  await prisma.$disconnect()
})

try {
  await app.listen({ port: env.env.PORT, host: "0.0.0.0" })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
