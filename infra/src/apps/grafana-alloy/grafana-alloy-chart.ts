import { readFileSync } from "node:fs"
import { Chart, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { GrafanaAlloy } from "./constants"

import type { Construct } from "constructs"
import type { GrafanaAlloyProps } from "./config"

export class GrafanaAlloyChart extends Chart {
  constructor(scope: Construct, id: string, props: GrafanaAlloyProps) {
    super(scope, id, props)

    const configMap = new kplus.ConfigMap(this, "config-map", {
      data: {
        "config.alloy": readFileSync(
          new URL("./config.alloy", import.meta.url),
          "utf8",
        ),
      },
    })
    const configVolume = kplus.Volume.fromConfigMap(
      this,
      "config-volume",
      configMap,
    )

    // working data volume
    const dataVolume = kplus.Volume.fromEmptyDir(this, "data-volume", "data")

    // give Alloy its own identity when it calls the Kubernetes API
    const serviceAccount = new kplus.ServiceAccount(this, "service-account")
    // define permissions within this chart's namespace
    const role = new kplus.Role(this, "role")
    // discover Pods and watch for changes to them
    role.allowRead(kplus.ApiResource.PODS)
    // read the log stream of a Pod's container
    role.allowGet(
      kplus.ApiResource.custom({
        apiGroup: "",
        resourceType: "pods/log",
      }),
    )
    // grant these permissions to Alloy's ServiceAccount
    role.bind(serviceAccount)

    const deployment = new kplus.Deployment(this, "deployment", {
      replicas: 1,
      strategy: kplus.DeploymentStrategy.rollingUpdate(),
      securityContext: { fsGroup: 10001 },
      volumes: [configVolume, dataVolume],
      serviceAccount, // run the Pod under Alloy's identity
      automountServiceAccountToken: true, // allow Alloy to authenticate to the API
      containers: [
        {
          image: props.image,
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          securityContext: { user: 10001 },
          args: [
            "run",
            "--server.http.listen-addr=0.0.0.0:12345",
            "--storage.path=/var/lib/alloy",
            "/etc/alloy/config.alloy",
          ],
          ports: [{ number: 12345 }],
          volumeMounts: [
            { path: "/etc/alloy", volume: configVolume, readOnly: true },
            { path: "/var/lib/alloy", volume: dataVolume },
          ],
          readiness: kplus.Probe.fromHttpGet("/-/ready", { port: 12345 }),
          resources: {
            cpu: {
              request: kplus.Cpu.millis(100),
              limit: kplus.Cpu.millis(1000),
            },
            memory: {
              request: Size.mebibytes(128),
              limit: Size.mebibytes(256),
            },
          },
        },
      ],
    })

    deployment.exposeViaService({
      name: GrafanaAlloy.appName,
    })
  }
}
