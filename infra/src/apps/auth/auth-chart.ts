import { Chart, Duration, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { Auth } from "./constants"

import type { Construct } from "constructs"
import type { AuthProps } from "./config"

export class AuthChart extends Chart {
  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id, props)

    // migrations job
    const authDbSecrets = kplus.Secret.fromSecretName(
      this,
      `${id}-auth-db-credentials`,
      Auth.secrets.migrationJobSecretName,
    )

    new kplus.Job(this, "migration", {
      containers: [
        {
          image: props.image,
          command: ["npm", "run", "db:deploy"],
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          // UID of the node user in the Auth image; Kubernetes can verify it is non-root.
          securityContext: { user: 1000 },
          envFrom: [kplus.Env.fromSecret(authDbSecrets)],
          resources: {
            cpu: { request: kplus.Cpu.millis(50), limit: undefined },
            memory: { request: Size.mebibytes(256), limit: Size.gibibytes(1) },
          },
        },
      ],
    })

    // app env variables
    const authAppSecrets = kplus.Secret.fromSecretName(
      this,
      `${id}-env-variables`,
      Auth.secrets.primarySecretName,
    )

    // JWT private key in .pem file
    const keysSecrets = kplus.Secret.fromSecretName(
      this,
      `${id}-keys-secrets`,
      Auth.secrets.jwtPrivateKey,
    )

    const keysVolume = kplus.Volume.fromSecret(
      this,
      `${id}-keys-volume`,
      keysSecrets,
    )

    const deployment = new kplus.Deployment(this, "deployment", {
      replicas: 1,
      strategy: kplus.DeploymentStrategy.rollingUpdate(),
      volumes: [keysVolume],
      containers: [
        {
          image: props.image,
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          securityContext: { user: 1000 }, // UID of `node` user in Auth image
          envFrom: [kplus.Env.fromSecret(authAppSecrets)],
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
          ports: [{ number: 3002 }],
          startup: kplus.Probe.fromTcpSocket({
            port: 3002,
            periodSeconds: Duration.seconds(5),
            failureThreshold: 30,
          }),
          readiness: kplus.Probe.fromTcpSocket({ port: 3002 }),
          liveness: kplus.Probe.fromTcpSocket({
            port: 3002,
            failureThreshold: 6,
          }),
          volumeMounts: [
            {
              path: "/app/keys",
              volume: keysVolume,
              readOnly: true,
            },
          ],
          envVariables: {
            JWT_PRIVATE_KEY_PATH: kplus.EnvValue.fromValue(
              "/app/keys/private.pem",
            ),
          },
        },
      ],
    })

    deployment.exposeViaService({
      name: Auth.appName,
    })
  }
}
