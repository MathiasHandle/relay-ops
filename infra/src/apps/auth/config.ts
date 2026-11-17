import type { Env } from "@/env"

export type AuthProps = {
  namespace: string
  environment: string
  image: string
}

export function resolveAuthProps(env: Env) {
  const config: Record<Env, AuthProps> = {
    local: {
      namespace: "relay-ops",
      environment: "local",
      image: "relay-ops-auth:local",
    },
  }

  return config[env]
}
