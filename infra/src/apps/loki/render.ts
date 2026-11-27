import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { resolveLokiProps } from "./config"
import { Loki } from "./constants"
import { LokiChart } from "./loki-chart"

import type { Env } from "@/env"

export function renderLoki(env: Env) {
  const app = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, Loki.appName),
  })

  new LokiChart(app, Loki.appName, resolveLokiProps(env))
  app.synth()
}
