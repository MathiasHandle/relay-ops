import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { resolveServerProps } from "./config"
import { Server } from "./constants"
import { ServerChart } from "./server-chart"

import type { Env } from "@/env"

export function renderServer(env: Env) {
  const app = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, Server.appName),
  })

  new ServerChart(app, Server.appName, resolveServerProps(env))
  app.synth()
}
