import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { z } from "zod"

const APP_DB_DIR = resolve(import.meta.dirname, "../../../../packages/app-db")
const setupEnvSchema = z.object({ APP_DATABASE_URL: z.url() })

// Reset once per integration run, before any test file imports the Prisma client.
export default function setup() {
  const env = setupEnvSchema.parse(process.env)
  const databaseName = decodeURIComponent(
    new URL(env.APP_DATABASE_URL).pathname.slice(1),
  )

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to reset database "${databaseName}": test database name must end with "_test"`,
    )
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "reset", "--force"], {
    cwd: APP_DB_DIR,
    stdio: "inherit",
    env: { ...process.env, APP_DATABASE_URL: env.APP_DATABASE_URL },
  })
}
