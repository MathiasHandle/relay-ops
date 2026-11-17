import { Chart, Duration, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { Server } from "./constants"

import type { Construct } from "constructs"
import type { ServerProps } from "./config"

export class ServerChart extends Chart {
  constructor(scope: Construct, id: string, props: ServerProps) {
    super(scope, id, props)

    const env = kplus.Secret.fromSecretName(
      this,
      `${id}-env-variables`,
      Server.secrets.primarySecretName,
    )

    const deployment = new kplus.Deployment(this, "deployment", {
      replicas: 1,
      strategy: kplus.DeploymentStrategy.rollingUpdate(),
      containers: [
        {
          image: props.image,
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
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
          ports: [{ number: 3001 }],
          startup: kplus.Probe.fromTcpSocket({
            port: 3001,
            periodSeconds: Duration.seconds(5),
            failureThreshold: 30,
          }),
          readiness: kplus.Probe.fromTcpSocket({ port: 3001 }),
          liveness: kplus.Probe.fromTcpSocket({
            port: 3001,
            failureThreshold: 6,
          }),
        },
      ],
    })

    deployment.exposeViaService({
      name: deployment.name.replace("deployment", "service"),
    })
  }
}
