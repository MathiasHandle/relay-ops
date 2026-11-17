# Local Kubernetes

Run from the repository root with dependencies installed, Docker, k3d, kubectl and OpenSSL available. PostgreSQL runs locally; production databases will use Neon.

## 1. Cluster and Secrets

```sh
k3d cluster create relay-ops
kubectl create namespace relay-ops
RELAY_OPS_ENV_DIR="$HOME/.config/relay-ops"
mkdir -p "$RELAY_OPS_ENV_DIR"
```

Prepare these env files in that directory:

| File                        | Variables                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `auth-db-env-variables.env` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=relay_ops_auth`                              |
| `auth-db-credentials.env`   | `AUTH_DATABASE_URL` for migrations                                                              |
| `auth-env-variables.env`    | `AUTH_DATABASE_URL`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_PRIVATE_KEY_PATH=/app/keys/private.pem` |

Use these cluster addresses, not `localhost`, in connection URLs:

- Auth DB: `auth-db-service-c877ff9e:5432/relay_ops_auth`.
- JWKS: `http://auth-service-c8168b25:3002/.well-known/jwks.json`.

Database URLs must match the PostgreSQL credentials; percent-encode URL credentials. Use `JWT_ISSUER=http://localhost:3002` for local development and leave `PORT` unset.

```sh
openssl genpkey -algorithm ED25519 -out "$RELAY_OPS_ENV_DIR/private.pem"
chmod 600 "$RELAY_OPS_ENV_DIR/private.pem"
kubectl create secret generic auth-jwt-key -n relay-ops --from-file=private.pem="$RELAY_OPS_ENV_DIR/private.pem"
for name in auth-db-env-variables auth-db-credentials auth-env-variables; do
  kubectl create secret generic "$name" -n relay-ops --from-env-file="$RELAY_OPS_ENV_DIR/$name.env"
done
```

## 2. Build and import images

```sh
docker build -f apps/auth/Dockerfile -t relay-ops-auth:local .
docker build -f apps/auth/Dockerfile --target build -t relay-ops-auth-seed:local .
k3d image import -c relay-ops relay-ops-auth:local \
  relay-ops-auth-seed:local
```

## 3. Databases

```sh
pnpm --filter @relay-ops/infra synth local
kubectl apply -f infra/dist/local/auth-db/
kubectl rollout status deployment/auth-db-deployment-c877ff9e -n relay-ops
```

## 4. Migrations and local seed

Continue only when each wait succeeds. Do not apply all manifests recursively.

```sh
kubectl create -f infra/dist/local/auth/Job.*.yaml
kubectl wait -n relay-ops --for=condition=complete --timeout=90s \
  -f infra/dist/local/auth/Job.*.yaml
```

Optional development data:

```sh
kubectl create -f infra/dist/local/auth-seed/
kubectl wait -n relay-ops --for=condition=complete --timeout=90s \
  -f infra/dist/local/auth-seed/
```

## 5. Applications and access

```sh
kubectl apply -f infra/dist/local/auth/Service.*.yaml -f infra/dist/local/auth/Deployment.*.yaml
kubectl rollout status deployment/auth-deployment-c8168b25 -n relay-ops
```

Run each port-forward in a separate terminal:

```sh
kubectl port-forward -n relay-ops service/auth-service-c8168b25 3002:3002
```

## Notes

- To rerun a finished Job, delete it with `kubectl delete -f <job-manifest>`, then repeat create/wait. This does not delete database data. Inspect failures with `kubectl logs -n relay-ops job/<job-name>`; never reset the database to rerun a Job.
- Seeds are local only, preserve existing clients, and include known development credentials.
- PVCs retain data across Pod replacement and normally cluster stop/start. Deleting the PVC or cluster can remove data; a new cluster does not automatically reconnect old storage. PostgreSQL initialization Secrets only affect empty storage.
