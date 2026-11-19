import { Chart } from "cdk8s"
import {
  RabbitmqCluster,
  RabbitmqClusterSpecPersistenceStorage,
} from "@/imports/rabbitmq.com"
import { RabbitMQ } from "./constants"

import type { Construct } from "constructs"
import type { RabbitMQProps } from "./config"

export class RabbitMQChart extends Chart {
  readonly serviceName: string

  constructor(scope: Construct, id: string, props: RabbitMQProps) {
    super(scope, id, props)

    const cluster = new RabbitmqCluster(this, "cluster", {
      metadata: { name: RabbitMQ.appName, namespace: props.namespace },
      spec: {
        replicas: 1,
        persistence: {
          storage: RabbitmqClusterSpecPersistenceStorage.fromString("1Gi"),
        },
      },
    })
    this.serviceName = cluster.name
  }
}
