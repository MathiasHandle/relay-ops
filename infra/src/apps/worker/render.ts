import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { resolveWorkerProps } from "./config"
import { Worker } from "./constants"
import { WorkerChart } from "./worker-chart"

import type { Env } from "@/env"

export function renderWorker(env: Env) {
  const app = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, Worker.appName),
  })

  new WorkerChart(app, Worker.appName, resolveWorkerProps(env))
  app.synth()
}
