import { Chart, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { AppDb } from "./constants"

import type { Construct } from "constructs"

export class AppDbMigrationChart extends Chart {
  constructor(scope: Construct, id: string) {
    super(scope, id, { namespace: "relay-ops" })

    const secret = kplus.Secret.fromSecretName(
      this,
      `${id}-credentials`,
      AppDb.secrets.migration,
    )
    // prisma needs a writable temporary directory with a read-only root filesystem.
    const tmp = kplus.Volume.fromEmptyDir(this, `${id}-tmp`, "tmp")

    new kplus.Job(this, "migration", {
      volumes: [tmp],
      containers: [
        {
          image: AppDb.image,
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          workingDir: "/packages/app-db",
          command: ["npm", "run", "db:deploy"],
          securityContext: { user: 1000 }, // UID of the node user in the image
          envFrom: [kplus.Env.fromSecret(secret)],
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
