import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { resolveGrafanaAlloyProps } from "./config"
import { GrafanaAlloy } from "./constants"
import { GrafanaAlloyChart } from "./grafana-alloy-chart"

import type { Env } from "@/env"

export function renderGrafanaAlloy(env: Env) {
  const app = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, GrafanaAlloy.appName),
  })

  new GrafanaAlloyChart(
    app,
    GrafanaAlloy.appName,
    resolveGrafanaAlloyProps(env),
  )
  app.synth()
}
