import type { Env } from "@/env"

export type LokiProps = {
  namespace: string
  environment: string
  image: string
}

export function resolveLokiProps(env: Env) {
  const config: Record<Env, LokiProps> = {
    local: {
      namespace: "relay-ops",
      environment: "local",
      image: "grafana/loki:3.7.11",
    },
  }

  return config[env]
}
