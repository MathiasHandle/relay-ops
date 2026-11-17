import type { Env } from "@/env"

export type WorkerProps = {
  namespace: string
  environment: string
  image: string
}

export function resolveWorkerProps(env: Env) {
  const config: Record<Env, WorkerProps> = {
    local: {
      namespace: "relay-ops",
      environment: "local",
      image: "relay-ops-worker:local",
    },
  }

  return config[env]
}
