# Local Kubernetes

Run from the repository root with dependencies installed, Docker, k3d, kubectl and OpenSSL available. PostgreSQL runs locally; production databases will use Neon. This procedure is for a new cluster: if `relay-ops` already exists, reuse its credentials and key; never regenerate or overwrite them against existing data.

## 1. Cluster and Secrets

```sh
k3d cluster create relay-ops --image rancher/k3s:v1.35.5-k3s1
kubectl config current-context # must be k3d-relay-ops
kubectl create namespace relay-ops
RELAY_OPS_ENV_DIR="$HOME/.config/relay-ops"
umask 077
mkdir -p -m 700 "$RELAY_OPS_ENV_DIR"
```

Prepare the following files as `KEY=value` lines without quotes. For a new local cluster, use the development values from `apps/auth/.env.example`, `apps/server/.env.example`, `apps/worker/.env.example` and `compose.yaml`. These are known development credentials; do not use them in production or expose the cluster publicly. Do not commit the env files or signing key.

| File                               | Variables                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `auth-db-env-variables.env`        | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=relay_ops_auth`                              |
| `app-db-env-variables.env`         | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=relay_ops_app`                               |
| `auth-db-credentials.env`          | `AUTH_DATABASE_URL` for migrations                                                              |
| `auth-env-variables.env`           | `AUTH_DATABASE_URL`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_PRIVATE_KEY_PATH=/app/keys/private.pem` |
| `app-db-migration-credentials.env` | `APP_DATABASE_URL` for migrations                                                               |
| `app-db-seed-env-variables.env`    | `APP_DATABASE_URL`, `JWT_ISSUER`                                                                |
| `server-env-variables.env`         | `APP_DATABASE_URL`, `RABBITMQ_URL`, `AUTH_JWKS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE`               |
| `worker-env-variables.env`         | `APP_DATABASE_URL`, `RABBITMQ_URL`                                                              |
| `rabbitmq-app-credentials.env`     | `username`, `password` for the RabbitMQ application user                                        |

Use these cluster addresses, not `localhost`, in connection URLs:

- Auth DB: `auth-db:5432/relay_ops_auth`.
- App DB: `app-db:5432/relay_ops_app`.
- JWKS: `http://auth:3002/.well-known/jwks.json`.
- RabbitMQ: `rabbitmq:5672/relay-ops`.

Use the matching database usernames, passwords and names from `compose.yaml`. Use the RabbitMQ application credentials from the Server or Worker example both in `rabbitmq-app-credentials.env` and in their `RABBITMQ_URL`. Preserve URL credentials, database names, vhost and query parameters while replacing the host and port with the cluster addresses above. Use the examples' JWT issuer and audience consistently; unlike the JWKS URL, the issuer is not a cluster Service address. Set the key path as shown in the table and leave `PORT` unset.

Optionally set `LOG_LEVEL` in the auth, server or worker env file. It defaults to `info`; allowed values are `trace`, `debug`, `info`, `warn`, `error`, `fatal` and `silent`. Server and publisher share the server Secret. After updating a Secret, restart the corresponding Deployments to load the new value.

Keep this directory for subsequent runs: PostgreSQL initializes credentials only on empty storage, and the Job does not rotate an existing RabbitMQ user's password.

```sh
test -f "$RELAY_OPS_ENV_DIR/private.pem" || openssl genpkey -algorithm ED25519 -out "$RELAY_OPS_ENV_DIR/private.pem"
chmod 600 "$RELAY_OPS_ENV_DIR/private.pem"
kubectl create secret generic auth-jwt-key -n relay-ops --from-file=private.pem="$RELAY_OPS_ENV_DIR/private.pem"
for name in auth-db-env-variables app-db-env-variables auth-db-credentials \
  auth-env-variables app-db-migration-credentials app-db-seed-env-variables \
  server-env-variables worker-env-variables; do
  kubectl create secret generic "$name" -n relay-ops --from-env-file="$RELAY_OPS_ENV_DIR/$name.env"
done
kubectl create secret generic rabbitmq-app-credentials -n relay-ops \
  --from-env-file="$RELAY_OPS_ENV_DIR/rabbitmq-app-credentials.env"
```

The setup Job creates the example RabbitMQ application user without management tags. It is separate from the operator-generated administrator account.

## 2. Build and import images

```sh
docker build -f apps/auth/Dockerfile -t relay-ops-auth:local .
docker build -f apps/auth/Dockerfile --target build -t relay-ops-auth-seed:local .
docker build -f packages/app-db/Dockerfile -t relay-ops-app-db:local .
docker build -f apps/server/Dockerfile -t relay-ops-server:local .
docker build -f apps/worker/Dockerfile -t relay-ops-worker:local .
k3d image import -c relay-ops relay-ops-auth:local relay-ops-auth-seed:local \
  relay-ops-app-db:local relay-ops-server:local relay-ops-worker:local
```

## 3. Databases

```sh
pnpm --filter @relay-ops/infra synth local
kubectl apply -f infra/dist/local/auth-db/ -f infra/dist/local/app-db/
kubectl rollout status deployment/auth-db-deployment-c877ff9e -n relay-ops
kubectl rollout status deployment/app-db-deployment-c84b73b0 -n relay-ops
```

## 4. Migrations and local seed

Continue only when each wait succeeds. Do not apply all manifests recursively.

```sh
kubectl create -f infra/dist/local/auth/Job.*.yaml -f infra/dist/local/app-db-migration/
kubectl wait -n relay-ops --for=condition=complete --timeout=90s \
  -f infra/dist/local/auth/Job.*.yaml -f infra/dist/local/app-db-migration/
```

Optional development data:

```sh
kubectl create -f infra/dist/local/auth-seed/ -f infra/dist/local/app-db-seed/
kubectl wait -n relay-ops --for=condition=complete --timeout=90s \
  -f infra/dist/local/auth-seed/ -f infra/dist/local/app-db-seed/
```

## 5. Applications and access

Install cert-manager and the RabbitMQ Cluster Operator before applying the RabbitMQ chart. These versions require a compatible Kubernetes version:

```sh
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.20.4/cert-manager.yaml
kubectl rollout status deployment/cert-manager -n cert-manager
kubectl rollout status deployment/cert-manager-cainjector -n cert-manager
kubectl rollout status deployment/cert-manager-webhook -n cert-manager
kubectl apply -f https://github.com/rabbitmq/cluster-operator/releases/download/v2.23.3/cluster-operator.yml
kubectl rollout status deployment/rabbitmq-cluster-operator -n rabbitmq-system
kubectl apply -f infra/dist/local/rabbitmq/
kubectl wait -n relay-ops --for=condition=AllReplicasReady --timeout=180s rabbitmqcluster/rabbitmq
kubectl apply -f infra/dist/local/rabbitmq-setup/ConfigMap.*.yaml
kubectl create -f infra/dist/local/rabbitmq-setup/Job.*.yaml
kubectl wait -n relay-ops --for=condition=complete --timeout=240s -f infra/dist/local/rabbitmq-setup/Job.*.yaml
```

The Job creates the vhost and application user when absent, sets permissions and checks an AMQP connection. It does not change an existing user's password. If the Secret does not match an existing user, the Job fails; credential rotation is a separate operation. Wait for the Job to succeed before starting the applications.

Then start the applications:

```sh
kubectl apply -f infra/dist/local/auth/Service.*.yaml -f infra/dist/local/auth/Deployment.*.yaml \
  -f infra/dist/local/server/ -f infra/dist/local/worker/
kubectl rollout status deployment/auth-deployment-c8168b25 -n relay-ops
kubectl rollout status deployment/server-deployment-c8f6431d -n relay-ops
kubectl rollout status deployment/outbox-publisher-deployment-c8556605 -n relay-ops
kubectl rollout status deployment/worker-deployment-c8f5585d -n relay-ops
```

Run each port-forward in a separate terminal:

```sh
kubectl port-forward -n relay-ops service/auth 3002:3002
kubectl port-forward -n relay-ops service/server 3001:3001
```

## 6. Local log viewer

Grafana uses its own persistent storage for users and dashboards; Loki stores logs separately. Create local Grafana credentials once and preserve the file and Secret for an existing installation:

```sh
umask 077
test -f "$RELAY_OPS_ENV_DIR/grafana-admin-credentials.env" || printf 'GF_SECURITY_ADMIN_USER=admin\nGF_SECURITY_ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 24)" > "$RELAY_OPS_ENV_DIR/grafana-admin-credentials.env"
kubectl create secret generic grafana-admin-credentials -n relay-ops --from-env-file="$RELAY_OPS_ENV_DIR/grafana-admin-credentials.env"
pnpm --filter @relay-ops/infra synth local
kubectl apply -f infra/dist/local/loki/
kubectl rollout status deployment/loki-deployment-c8cf3120 -n relay-ops
kubectl apply -f infra/dist/local/grafana-alloy/ -f infra/dist/local/grafana/
kubectl rollout status deployment/grafana-alloy-deployment-c831649b -n relay-ops
kubectl rollout status deployment/grafana-deployment-c8f93cac -n relay-ops
kubectl port-forward -n relay-ops service/grafana 3000:3000
```

Open http://localhost:3000 and sign in with the credentials in `grafana-admin-credentials.env`. In Explore, select Loki and query `{service_name="worker"}`; use `| json` to parse structured logs. Grafana provisions the Loki datasource automatically. Changing the Secret does not reset an existing Grafana admin password.

## Notes

- The server image also runs the separate outbox publisher Deployment. It retries publishing after failures; Kubernetes restarts the process when its channel closes or a batch times out. It removes published outbox records older than seven days.
- The outbox migration does not backfill existing deliveries. Before switching an existing installation, stop producers and inspect pending deliveries and RabbitMQ queues; decide explicitly how to recover each uncertain delivery. Blindly creating pending outbox records can cause duplicate delivery. Complete the migration before starting the new server and publisher.
- To rerun a finished Job, delete it with `kubectl delete -f <job-manifest>`, then repeat create/wait. This does not delete database data. Inspect failures with `kubectl logs -n relay-ops job/<job-name>`; never reset the database to rerun a Job.
- Seeds are local only, preserve existing records, and include known credentials and placeholder destination URLs. Configure a trusted receiver before testing delivery.
- PVCs retain data across Pod replacement and normally cluster stop/start. Deleting the PVC or cluster can remove data; a new cluster does not automatically reconnect old storage. PostgreSQL initialization Secrets only affect empty storage.
