import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { AuthChart } from "./auth-chart"
import { resolveAuthProps } from "./config"
import { Auth } from "./constants"
import { LocalAuthSeedChart } from "./local-seed-chart"

import type { Env } from "@/env"

export function renderAuth(env: Env) {
  const chartProps = resolveAuthProps(env)

  const app = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, Auth.appName),
  })

  new AuthChart(app, Auth.appName, chartProps)
  app.synth()

  if (env === "local") {
    const seedApp = new App({
      yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
      outputFileExtension: ".yaml",
      outdir: path.join("dist", "local", "auth-seed"),
    })
    new LocalAuthSeedChart(seedApp, "auth-local-seed")
    seedApp.synth()
  }
}
