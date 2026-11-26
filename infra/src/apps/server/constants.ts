export const Server = {
  appName: "server",
  secrets: { primarySecretName: "server-env-variables" },
}

export const OutboxPublisher = {
  appName: "outbox-publisher",
  secrets: { primarySecretName: Server.secrets.primarySecretName },
}
