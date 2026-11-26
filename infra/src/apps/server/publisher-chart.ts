import { Chart, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { OutboxPublisher } from "./constants"

import type { Construct } from "constructs"
import type { ServerProps } from "./config"

export class PublisherChart extends Chart {
  constructor(scope: Construct, id: string, props: ServerProps) {
    super(scope, id, props)

    const env = kplus.Secret.fromSecretName(
      this,
      `${id}-env-variables`,
      OutboxPublisher.secrets.primarySecretName,
    )

    new kplus.Deployment(this, "deployment", {
      replicas: 1,
      strategy: kplus.DeploymentStrategy.rollingUpdate(),
      containers: [
        {
          image: props.image,
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          command: ["node", "dist/publisher.js"],
          securityContext: { user: 1000 },
          envFrom: [kplus.Env.fromSecret(env)],
          resources: {
            cpu: {
              request: kplus.Cpu.millis(100),
              limit: kplus.Cpu.millis(1000),
            },
            memory: {
              request: Size.mebibytes(256),
              limit: Size.mebibytes(512),
            },
          },
        },
      ],
    })
  }
}
