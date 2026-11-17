import type { Env } from "@/env"

export type ServerProps = {
  namespace: string
  environment: string
  image: string
}

export function resolveServerProps(env: Env) {
  const config: Record<Env, ServerProps> = {
    local: {
      namespace: "relay-ops",
      environment: "local",
      image: "relay-ops-server:local",
    },
  }

  return config[env]
}
