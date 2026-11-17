import type { Env } from "@/env"

type AppDbProps = {
  namespace: string
  environment: string
}

export function resolveAppDbProps(env: Env) {
  const config: Record<Env, AppDbProps> = {
    local: {
      namespace: "relay-ops",
      environment: "local",
    },
  }

  return config[env]
}
