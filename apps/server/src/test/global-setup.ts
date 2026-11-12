import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { resolve } from "node:path"
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose"
import z from "zod"

import type { JWK } from "jose"
import type { TestProject } from "vitest/node"

declare module "vitest" {
  export interface ProvidedContext {
    // Private part of the throwaway test signing key; tokens signed with it
    // verify against the JWKS served below.
    testSigningKey: { privateJwk: JWK; kid: string }
  }
}

// packages/app-db holds the Prisma CLI, config and migrations of the app DB.
const APP_DB_DIR = resolve(import.meta.dirname, "../../../../packages/app-db")

const setupEnvSchema = z.object({
  APP_DATABASE_URL: z.url(),
  AUTH_JWKS_URL: z.url(),
})

/**
 * Runs once before all integration test files (Vitest `globalSetup`).
 *
 * 1. Refuses to run against a database that is not a `_test` database.
 * 2. Resets the test database: drops everything and applies all migrations.
 * 3. Generates a throwaway Ed25519 signing key and serves its public part as JWKS
 *    at `AUTH_JWKS_URL`, so tests sign their own tokens without apps/auth.
 */
export default async function setup(project: TestProject) {
  const env = setupEnvSchema.parse(process.env)

  // Safety guard: the reset below deletes all data.
  const databaseName = new URL(env.APP_DATABASE_URL).pathname.slice(1)
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to reset database "${databaseName}": test database name must end with "_test"`,
    )
  }

  // `prisma migrate reset` creates the test database if it does not exist yet.
  // prisma.config.ts loads packages/app-db/.env (dev DB) via dotenv, but dotenv
  // never overrides variables already set, so APP_DATABASE_URL from .env.test is used.
  execFileSync("pnpm", ["exec", "prisma", "migrate", "reset", "--force"], {
    cwd: APP_DB_DIR,
    stdio: "inherit",
  })

  const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
    extractable: true,
  })
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)
  const jwks = JSON.stringify({
    keys: [{ ...publicJwk, kid, alg: "EdDSA", use: "sig" }],
  })

  project.provide("testSigningKey", {
    privateJwk: await exportJWK(privateKey),
    kid,
  })

  const jwksUrl = new URL(env.AUTH_JWKS_URL)
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === jwksUrl.pathname) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(jwks)
      return
    }

    response.writeHead(404).end()
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(Number(jwksUrl.port), jwksUrl.hostname, resolve)
  })

  // teardown
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
