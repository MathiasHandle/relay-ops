import { rmSync } from "node:fs"
import path from "node:path"
import { Command, InvalidArgumentError } from "commander"
import { renderAppDb } from "./apps/app-db/render"
import { renderAuth } from "./apps/auth/render"
import { renderAuthDb } from "./apps/auth-db/render"
import { renderGrafanaAlloy } from "./apps/grafana-alloy/render"
import { renderLoki } from "./apps/loki/render"
import { renderRabbitMQ } from "./apps/rabbitmq/render"
import { renderServer } from "./apps/server/render"
import { renderWorker } from "./apps/worker/render"

import type { Env } from "./env"

const charts = {
  // local only charts
  authDb: renderAuthDb,
  appDb: renderAppDb,
  loki: renderLoki,
  grafanaAlloy: renderGrafanaAlloy,

  // production charts
  authApp: renderAuth,
  server: renderServer,
  worker: renderWorker,
  rabbitMQ: renderRabbitMQ,
}

function main(env: Env) {
  // remove stale manifests for this environment before generating new ones
  rmSync(path.join("dist", env), { recursive: true, force: true })

  for (const synthFn of Object.values(charts)) {
    synthFn(env)
  }
}

function parseEnv(value: string): Env {
  if (value === "local") {
    return value
  }

  throw new InvalidArgumentError("Expected environment: local")
}

new Command()
  .argument("<env>", "Target environment", parseEnv)
  .action((env: Env) => main(env))
  .parse()
