import { readFileSync } from "node:fs"
import { Chart, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { Grafana } from "./constants"

import type { Construct } from "constructs"
import type { GrafanaProps } from "./config"

export class GrafanaChart extends Chart {
  constructor(scope: Construct, id: string, props: GrafanaProps) {
    super(scope, id, props)

    const credentials = kplus.Secret.fromSecretName(
      this,
      "admin-credentials",
      Grafana.secrets.adminCredentials,
    )
    const configMap = new kplus.ConfigMap(this, "datasource", {
      data: {
        "datasource.yaml": readFileSync(
          new URL("./datasource.yaml", import.meta.url),
          "utf8",
        ),
      },
    })
    const configVolume = kplus.Volume.fromConfigMap(
      this,
      "config-volume",
      configMap,
    )
    const dataClaim = new kplus.PersistentVolumeClaim(this, "data", {
      accessModes: [kplus.PersistentVolumeAccessMode.READ_WRITE_ONCE],
      storage: Size.gibibytes(1),
    })
    const dataVolume = kplus.Volume.fromPersistentVolumeClaim(
      this,
      "data-volume",
      dataClaim,
    )
    const tmpVolume = kplus.Volume.fromEmptyDir(this, "tmp-volume", "tmp")

    const deployment = new kplus.Deployment(this, "deployment", {
      replicas: 1,
      strategy: kplus.DeploymentStrategy.recreate(),
      securityContext: { fsGroup: 472 },
      volumes: [configVolume, dataVolume, tmpVolume],
      containers: [
        {
          image: props.image,
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          securityContext: { user: 472 },
          envFrom: [kplus.Env.fromSecret(credentials)],
          envVariables: {
            GF_PATHS_LOGS: kplus.EnvValue.fromValue("/var/lib/grafana/log"),
          },
          ports: [{ number: 3000 }],
          volumeMounts: [
            {
              path: "/etc/grafana/provisioning/datasources",
              volume: configVolume,
              readOnly: true,
            },
            { path: "/var/lib/grafana", volume: dataVolume },
            { path: "/tmp", volume: tmpVolume },
          ],
          readiness: kplus.Probe.fromHttpGet("/api/health", { port: 3000 }),
          resources: {
            cpu: {
              request: kplus.Cpu.millis(100),
              limit: kplus.Cpu.millis(1000),
            },
            memory: {
              request: Size.mebibytes(128),
              limit: Size.mebibytes(512),
            },
          },
        },
      ],
    })
    deployment.exposeViaService({ name: Grafana.appName })
  }
}
