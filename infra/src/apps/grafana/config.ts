import type { Env } from "@/env"

export type GrafanaProps = {
  namespace: string
  environment: string
  image: string
}

export function resolveGrafanaProps(env: Env) {
  const config: Record<Env, GrafanaProps> = {
    local: {
      namespace: "relay-ops",
      environment: "local",
      image: "grafana/grafana:13.3.0",
    },
  }

  return config[env]
}
