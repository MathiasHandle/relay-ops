import { execFileSync } from "node:child_process"
import { generateKeyPairSync } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { env } from "@/config/env"

/**
 * Runs once before all test files (Vitest `globalSetup`).
 *
 * 1. Refuses to run against a database that is not a `_test` database.
 * 2. Resets the test database: drops everything and applies all migrations.
 * 3. Generates a throwaway Ed25519 signing key, so tests never use the real one.
 */
export default function setup() {
  // Safety guard: the reset below deletes all data.
  const databaseName = new URL(env.AUTH_DATABASE_URL).pathname.slice(1)
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to reset database "${databaseName}": test database name must end with "_test"`,
    )
  }

  // `prisma migrate reset` creates the test database if it does not exist yet.
  // prisma.config.ts loads .env (dev DB) via dotenv, but dotenv never overrides
  // variables already set, so AUTH_DATABASE_URL from .env.test is used.
  execFileSync("prisma", ["migrate", "reset", "--force"], { stdio: "inherit" })

  const { privateKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  })
  mkdirSync(dirname(env.JWT_PRIVATE_KEY_PATH), { recursive: true })
  writeFileSync(env.JWT_PRIVATE_KEY_PATH, privateKey, { mode: 0o600 })
}
