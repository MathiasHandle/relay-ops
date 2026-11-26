import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { resolveServerProps } from "./config"
import { OutboxPublisher, Server } from "./constants"
import { PublisherChart } from "./publisher-chart"
import { ServerChart } from "./server-chart"

import type { Env } from "@/env"

export function renderServer(env: Env) {
  const app = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, Server.appName),
  })

  new ServerChart(app, Server.appName, resolveServerProps(env))
  new PublisherChart(app, OutboxPublisher.appName, resolveServerProps(env))
  app.synth()
}
