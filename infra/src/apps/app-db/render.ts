import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { AppDbChart } from "./app-db-chart"
import { resolveAppDbProps } from "./config"
import { AppDb } from "./constants"
import { LocalAppDbSeedChart } from "./local-seed-chart"
import { AppDbMigrationChart } from "./migration-chart"

import type { Env } from "@/env"

export function renderAppDb(env: Env) {
  const migrationApp = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, "app-db-migration"),
  })
  new AppDbMigrationChart(migrationApp, "app-db-migration")
  migrationApp.synth()

  // postgres and seed are only used locally
  if (env === "local") {
    const app = new App({
      yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
      outputFileExtension: ".yaml",
      outdir: path.join("dist", env, AppDb.appName),
    })
    new AppDbChart(app, AppDb.appName, resolveAppDbProps(env))
    app.synth()

    const seedApp = new App({
      yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
      outputFileExtension: ".yaml",
      outdir: path.join("dist", env, "app-db-seed"),
    })
    new LocalAppDbSeedChart(seedApp, "app-db-seed")
    seedApp.synth()
  }
}
