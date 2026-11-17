import { Chart, Duration, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { Worker } from "./constants"

import type { Construct } from "constructs"
import type { WorkerProps } from "./config"

export class WorkerChart extends Chart {
  constructor(scope: Construct, id: string, props: WorkerProps) {
    super(scope, id, props)

    const env = kplus.Secret.fromSecretName(
      this,
      `${id}-env-variables`,
      Worker.secrets.primarySecretName,
    )

    new kplus.Deployment(this, "deployment", {
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
          ports: [{ number: 3003 }],
          startup: kplus.Probe.fromTcpSocket({
            port: 3003,
            periodSeconds: Duration.seconds(5),
            failureThreshold: 30,
          }),
          readiness: kplus.Probe.fromTcpSocket({ port: 3003 }),
          liveness: kplus.Probe.fromTcpSocket({
            port: 3003,
            failureThreshold: 6,
          }),
        },
      ],
    })
  }
}
