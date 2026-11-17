# Local Kubernetes

Run from the repository root with dependencies installed, Docker, k3d and kubectl available.

## Cluster

```sh
k3d cluster create relay-ops
kubectl create namespace relay-ops
```

## Synth

```sh
pnpm --filter @relay-ops/infra synth local
```

Synth replaces `infra/dist/local/`. Application charts are added in the following commits.
