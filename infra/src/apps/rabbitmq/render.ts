import path from "node:path"
import { App, YamlOutputType } from "cdk8s"
import { resolveRabbitMQProps } from "./config"
import { RabbitMQ } from "./constants"
import { RabbitMQChart } from "./rabbitmq-chart"
import { RabbitMQSetupChart } from "./setup-chart"

import type { Env } from "@/env"

export function renderRabbitMQ(env: Env) {
  const app = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, RabbitMQ.appName),
  })

  const chart = new RabbitMQChart(
    app,
    RabbitMQ.appName,
    resolveRabbitMQProps(env),
  )
  app.synth()

  const setupApp = new App({
    yamlOutputType: YamlOutputType.FILE_PER_RESOURCE,
    outputFileExtension: ".yaml",
    outdir: path.join("dist", env, "rabbitmq-setup"),
  })
  new RabbitMQSetupChart(setupApp, "rabbitmq-setup", {
    namespace: resolveRabbitMQProps(env).namespace,
    serviceName: chart.serviceName,
  })
  setupApp.synth()
}
