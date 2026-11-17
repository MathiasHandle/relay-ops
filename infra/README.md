# Local Kubernetes

Run from the repository root with dependencies installed, Docker, k3d, kubectl and OpenSSL available. PostgreSQL runs locally; production databases will use Neon. The RabbitMQ chart is still pending: Server and Worker need a reachable broker.

## 1. Cluster and Secrets

```sh
k3d cluster create relay-ops
kubectl create namespace relay-ops
RELAY_OPS_ENV_DIR="$HOME/.config/relay-ops"
mkdir -p "$RELAY_OPS_ENV_DIR"
```

Prepare these env files in that directory:

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

Use these cluster addresses, not `localhost`, in connection URLs:

- Auth DB: `auth-db-service-c877ff9e:5432/relay_ops_auth`.
- App DB: `app-db-service-c84b73b0:5432/relay_ops_app`.
- JWKS: `http://auth-service-c8168b25:3002/.well-known/jwks.json`.

Database URLs must match the PostgreSQL credentials; percent-encode URL credentials. Keep `JWT_ISSUER` identical in Auth, Server and the seed (locally, `http://localhost:3002` works). Auth and Server must share `JWT_AUDIENCE`. Leave `PORT` unset. Include the vhost in the cluster-reachable `RABBITMQ_URL`.

```sh
openssl genpkey -algorithm ED25519 -out "$RELAY_OPS_ENV_DIR/private.pem"
chmod 600 "$RELAY_OPS_ENV_DIR/private.pem"
kubectl create secret generic auth-jwt-key -n relay-ops --from-file=private.pem="$RELAY_OPS_ENV_DIR/private.pem"
for name in auth-db-env-variables app-db-env-variables auth-db-credentials \
  auth-env-variables app-db-migration-credentials app-db-seed-env-variables \
  server-env-variables worker-env-variables; do
  kubectl create secret generic "$name" -n relay-ops --from-env-file="$RELAY_OPS_ENV_DIR/$name.env"
done
```

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

With RabbitMQ available:

```sh
kubectl apply -f infra/dist/local/auth/Service.*.yaml -f infra/dist/local/auth/Deployment.*.yaml \
  -f infra/dist/local/server/ -f infra/dist/local/worker/
kubectl rollout status deployment/auth-deployment-c8168b25 -n relay-ops
kubectl rollout status deployment/server-deployment-c8f6431d -n relay-ops
kubectl rollout status deployment/worker-deployment-c8f5585d -n relay-ops
```

Run each port-forward in a separate terminal:

```sh
kubectl port-forward -n relay-ops service/auth-service-c8168b25 3002:3002
kubectl port-forward -n relay-ops service/server-service-c8f6431d 3001:3001
```

## Notes

- To rerun a finished Job, delete it with `kubectl delete -f <job-manifest>`, then repeat create/wait. This does not delete database data. Inspect failures with `kubectl logs -n relay-ops job/<job-name>`; never reset the database to rerun a Job.
- Seeds are local only, preserve existing records, and include known credentials and placeholder destination URLs. Configure a trusted receiver before testing delivery.
- PVCs retain data across Pod replacement and normally cluster stop/start. Deleting the PVC or cluster can remove data; a new cluster does not automatically reconnect old storage. PostgreSQL initialization Secrets only affect empty storage.
