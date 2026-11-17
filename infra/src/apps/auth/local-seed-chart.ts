import { Chart, Size } from "cdk8s"
import kplus from "cdk8s-plus-32"
import { Auth } from "./constants"

import type { Construct } from "constructs"

export class LocalAuthSeedChart extends Chart {
  constructor(scope: Construct, id: string) {
    super(scope, id, { namespace: "relay-ops" })

    const env = kplus.Secret.fromSecretName(
      this,
      "auth-env-variables",
      Auth.secrets.primarySecretName,
    )
    const tmp = kplus.Volume.fromEmptyDir(this, "tmp", "tmp")

    new kplus.Job(this, "seed", {
      volumes: [tmp],
      containers: [
        {
          image: "relay-ops-auth-seed:local",
          imagePullPolicy: kplus.ImagePullPolicy.IF_NOT_PRESENT,
          workingDir: "/apps/auth",
          command: ["./node_modules/.bin/tsx", "prisma/seed/index.ts"],
          securityContext: { user: 1000 },
          envFrom: [kplus.Env.fromSecret(env)],
          volumeMounts: [{ path: "/tmp", volume: tmp }],
          resources: {
            cpu: { request: kplus.Cpu.millis(50), limit: undefined },
            memory: {
              request: Size.mebibytes(256),
              limit: Size.mebibytes(512),
            },
          },
        },
      ],
    })
  }
}
