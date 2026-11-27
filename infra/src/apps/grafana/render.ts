import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { resolveGrafanaProps } from "./config"
import { Grafana } from "./constants"
import { GrafanaChart } from "./grafana-chart"

import type { Env } from "@/env"

export function renderGrafana(env: Env) {
  const app = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, Grafana.appName),
  })

  new GrafanaChart(app, Grafana.appName, resolveGrafanaProps(env))
  app.synth()
}
