import type { Env } from "@/env"

export type RabbitMQProps = {
  namespace: string
  environment: string
}

export function resolveRabbitMQProps(env: Env) {
  const config: Record<Env, RabbitMQProps> = {
    local: {
      environment: "local",
      namespace: "relay-ops",
    },
  }

  return config[env]
}
