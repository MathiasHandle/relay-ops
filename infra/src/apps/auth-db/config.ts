import type { Env } from "@/env"

type AuthDbProps = {
  namespace: string
  environment: string
}

export function resolveAuthDbProps(env: Env) {
  const config: Record<Env, AuthDbProps> = {
    local: {
      namespace: "relay-ops",
      environment: "local",
    },
  }

  return config[env]
}
