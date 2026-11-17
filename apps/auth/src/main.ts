import { env } from "@/config/env"
import { buildApp } from "./app"

const app = await buildApp({ logger: true })

let shuttingDown = false

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    if (shuttingDown) return
    shuttingDown = true

    app.log.info({ signal }, "Shutting down")
    try {
      await app.close()
      process.exit(0)
    } catch (err) {
      app.log.error({ err }, "Failed to shut down")
      process.exit(1)
    }
  })
}

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
