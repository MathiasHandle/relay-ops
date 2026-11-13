import { env } from "@/config/env"
import { buildApp } from "./app"

const app = await buildApp({ logger: true })

// graceful shutdown; after `app.close()` fastify runs `onClose` hooks
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "Shutting down")
    await app.close()
    process.exit(0)
  })
}

try {
  await app.listen({ port: env.PORT })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
