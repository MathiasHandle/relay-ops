import { Chart, Duration, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { AppDb } from "./constants"

import type { ChartProps } from "cdk8s"
import type { Construct } from "constructs"

export class AppDbChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props)

    const secret = kplus.Secret.fromSecretName(
      this,
      `${id}-env-variables`,
      AppDb.secrets.database,
    )

    const claim = new kplus.PersistentVolumeClaim(this, `${id}-data`, {
      accessModes: [kplus.PersistentVolumeAccessMode.READ_WRITE_ONCE],
      storage: Size.mebibytes(256),
    })
    const volume = kplus.Volume.fromPersistentVolumeClaim(
      this,
      `${id}-data-volume`,
      claim,
    )

    // PostgreSQL needs a writable directory for its socket and lock files.
    const runtime = kplus.Volume.fromEmptyDir(
      this,
      `${id}-postgres-runtime`,
      "postgres-runtime",
    )

    const command = [
      "sh",
      "-c",
      'exec pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ]

    const deployment = new kplus.Deployment(this, "deployment", {
      replicas: 1,
      strategy: kplus.DeploymentStrategy.recreate(),
      volumes: [volume, runtime],
      containers: [
        {
          image: "postgres:18",
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          securityContext: { ensureNonRoot: false },
          envFrom: [kplus.Env.fromSecret(secret)],
          volumeMounts: [
            { path: "/var/lib/postgresql", volume },
            { path: "/var/run/postgresql", volume: runtime },
          ],
          resources: {
            cpu: { request: kplus.Cpu.millis(50), limit: undefined },
            memory: { request: Size.mebibytes(256), limit: Size.gibibytes(1) },
          },
          ports: [{ number: 5432 }],
          startup: kplus.Probe.fromCommand(command, {
            periodSeconds: Duration.seconds(5),
            failureThreshold: 30,
          }),
          readiness: kplus.Probe.fromCommand(command),
          liveness: kplus.Probe.fromCommand(command, { failureThreshold: 6 }),
        },
      ],
    })

    deployment.exposeViaService({
      name: AppDb.appName,
    })
  }
}
