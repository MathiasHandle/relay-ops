import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { AuthDbChart } from "./auth-db-chart"
import { resolveAuthDbProps } from "./config"
import { AuthDb } from "./constants"

import type { Env } from "@/env"

export function renderAuthDb(env: Env) {
  const chartProps = resolveAuthDbProps(env)

  const app = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, AuthDb.appName),
  })

  new AuthDbChart(app, AuthDb.appName, chartProps)
  app.synth()
}
