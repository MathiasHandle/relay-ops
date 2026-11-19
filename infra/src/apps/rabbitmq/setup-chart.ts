import { readFileSync } from "node:fs"
import { ApiObject, Chart, Duration, JsonPatch, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"

import type { Construct } from "constructs"

type SetupProps = {
  namespace: string
  serviceName: string
}

export class RabbitMQSetupChart extends Chart {
  constructor(scope: Construct, id: string, props: SetupProps) {
    super(scope, id, { namespace: props.namespace })

    const admin = kplus.Secret.fromSecretName(
      this,
      "admin",
      `${props.serviceName}-default-user`,
    )
    const application = kplus.Secret.fromSecretName(
      this,
      "application",
      "rabbitmq-app-credentials",
    )
    const script = new kplus.ConfigMap(this, "script", {
      data: {
        "setup.mjs": readFileSync(
          new URL("./setup.mjs", import.meta.url),
          "utf8",
        ),
      },
    })
    const volume = kplus.Volume.fromConfigMap(this, "script-volume", script)

    const job = new kplus.Job(this, "job", {
      backoffLimit: 2,
      activeDeadline: Duration.seconds(180),
      automountServiceAccountToken: false,
      volumes: [volume],
      containers: [
        {
          image: "relay-ops-worker:local",
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          workingDir: "/app",
          command: ["node", "/app/rabbitmq-setup.mjs"],
          securityContext: { user: 1000 },
          envVariables: {
            RABBITMQ_HOST: kplus.EnvValue.fromValue(props.serviceName),
            RABBITMQ_VHOST: kplus.EnvValue.fromValue("relay-ops"),
            RABBITMQ_ADMIN_USER: admin.envValue("username"),
            RABBITMQ_ADMIN_PASSWORD: admin.envValue("password"),
            RABBITMQ_APP_USER: application.envValue("username"),
            RABBITMQ_APP_PASSWORD: application.envValue("password"),
          },
          volumeMounts: [
            {
              path: "/app/rabbitmq-setup.mjs",
              subPath: "setup.mjs",
              readOnly: true,
              volume,
            },
          ],
          resources: {
            cpu: {
              request: kplus.Cpu.millis(50),
              limit: kplus.Cpu.millis(500),
            },
            memory: { request: Size.mebibytes(64), limit: Size.mebibytes(256) },
          },
        },
      ],
    })
    ApiObject.of(job).addJsonPatch(
      JsonPatch.add("/spec/completions", 1),
      JsonPatch.add("/spec/parallelism", 1),
    )
  }
}
