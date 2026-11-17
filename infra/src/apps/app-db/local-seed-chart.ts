import { Chart, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { AppDb } from "./constants"

import type { Construct } from "constructs"

export class LocalAppDbSeedChart extends Chart {
  constructor(scope: Construct, id: string) {
    super(scope, id, { namespace: "relay-ops" })

    const env = kplus.Secret.fromSecretName(
      this,
      `${id}-env-variables`,
      AppDb.secrets.seed,
    )
    // tsx uses /tmp for its IPC socket.
    const tmp = kplus.Volume.fromEmptyDir(this, `${id}-tmp`, "tmp")

    new kplus.Job(this, "seed", {
      volumes: [tmp],
      containers: [
        {
          image: AppDb.image,
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          workingDir: "/packages/app-db",
          command: ["./node_modules/.bin/tsx", "prisma/seed/index.ts"],
          securityContext: { user: 1000 }, // UID of the node user in the image
          envFrom: [kplus.Env.fromSecret(env)],
          volumeMounts: [{ path: "/tmp", volume: tmp }],
          resources: {
            cpu: { request: kplus.Cpu.millis(50), limit: undefined },
            memory: { request: Size.mebibytes(256), limit: Size.gibibytes(1) },
          },
        },
      ],
    })
  }
}
