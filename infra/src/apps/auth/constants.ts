export const Auth = {
  appName: "auth",

  secrets: {
    primarySecretName: "auth-env-variables",
    migrationJobSecretName: "auth-db-credentials", // used for migration job
    jwtPrivateKey: "auth-jwt-key",
  },
}
