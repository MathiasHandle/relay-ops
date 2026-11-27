import { readFileSync } from "node:fs"
import { Chart, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { Loki } from "./constants"

import type { Construct } from "constructs"
import type { LokiProps } from "./config"

export class LokiChart extends Chart {
  constructor(scope: Construct, id: string, props: LokiProps) {
    super(scope, id, props)

    const configMap = new kplus.ConfigMap(this, "config-map", {
      data: {
        "loki.yaml": readFileSync(
          new URL("./loki-config.yaml", import.meta.url),
          "utf8",
        ),
      },
    })
    // mount Loki configuration as file
    const configVolume = kplus.Volume.fromConfigMap(
      this,
      "config-volume",
      configMap,
    )

    // persist Loki data and across pod replacements
    const dataClaim = new kplus.PersistentVolumeClaim(this, "data", {
      accessModes: [kplus.PersistentVolumeAccessMode.READ_WRITE_ONCE],
      storage: Size.gibibytes(1),
    })
    const dataVolume = kplus.Volume.fromPersistentVolumeClaim(
      this,
      "data-volume",
      dataClaim,
    )

    const deployment = new kplus.Deployment(this, "deployment", {
      replicas: 1,
      strategy: kplus.DeploymentStrategy.recreate(),
      securityContext: { fsGroup: 10001 },
      volumes: [configVolume, dataVolume],
      containers: [
        {
          image: props.image,
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          args: ["-config.file=/etc/loki/loki.yaml"],
          ports: [{ number: 3100 }],
          volumeMounts: [
            { path: "/etc/loki", volume: configVolume, readOnly: true },
            { path: "/var/loki", volume: dataVolume },
          ],
          readiness: kplus.Probe.fromHttpGet("/ready", { port: 3100 }),
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

    deployment.exposeViaService({
      name: Loki.appName,
    })
  }
}
