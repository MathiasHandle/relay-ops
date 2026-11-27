import type { Env } from "@/env"

export type GrafanaAlloyProps = {
  namespace: string
  environment: string
  image: string
}

export function resolveGrafanaAlloyProps(env: Env) {
  const config: Record<Env, GrafanaAlloyProps> = {
    local: {
      namespace: "relay-ops",
      environment: "local",
      image: "grafana/alloy:v1.22.0",
    },
  }

  return config[env]
}
